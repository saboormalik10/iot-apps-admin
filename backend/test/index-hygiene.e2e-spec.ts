import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import mongoose from 'mongoose';

/**
 * Policy test — no database connection needed; it reads the SCHEMAS.
 *
 * Two rules, both learned the hard way in M23:
 *
 *  1. An index must be declared in exactly ONE place. Declaring it both inline
 *     (`unique: true` on the field) and explicitly (`schema.index(...)`) builds
 *     the same index from two sources, so removing the visible declaration looks
 *     like it worked while the field quietly keeps the index alive. That is the
 *     same shape as the W1 bug where a dropped index came back from the schema.
 *
 *  2. No index may be a strict PREFIX of another with the same options. The
 *     longer one already serves every query the shorter one does, so the shorter
 *     is dead weight on every write — which on a 130M-row collection is not free.
 *
 * `query-plans.e2e-spec.ts` guards the DATABASE. This guards the declarations, so
 * a bad index is caught before anyone runs a migration.
 */
describe('index hygiene (schema declarations)', () => {
  const dir = join(__dirname, '..', 'src', 'models');

  beforeAll(() => {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      require(join(dir, f));
    }
  });

  const sig = (keys: Record<string, unknown>) =>
    Object.entries(keys)
      .map(([k, v]) => `${k}:${String(v)}`)
      .join(',');

  it('declares every index exactly once', () => {
    const dupes: string[] = [];

    for (const name of mongoose.modelNames()) {
      const schema = mongoose.model(name).schema;
      const seen = new Map<string, number>();
      for (const [keys] of schema.indexes()) {
        const s = sig(keys as Record<string, unknown>);
        seen.set(s, (seen.get(s) ?? 0) + 1);
      }
      for (const [s, n] of seen) if (n > 1) dupes.push(`${name} declares {${s}} ${n} times`);
    }

    expect(dupes).toEqual([]);
  });

  it('has no index that is a strict prefix of another', () => {
    const redundant: string[] = [];

    for (const name of mongoose.modelNames()) {
      const schema = mongoose.model(name).schema;
      const all = schema.indexes().map(([keys, opts]) => ({
        keys: Object.entries(keys as Record<string, unknown>).map(([k, v]) => `${k}:${String(v)}`),
        opts: (opts ?? {}) as Record<string, unknown>,
      }));

      for (const a of all) {
        for (const b of all) {
          if (a === b || a.keys.length >= b.keys.length) continue;
          const isPrefix = a.keys.every((k, i) => k === b.keys[i]);
          if (!isPrefix) continue;

          // A shorter index that carries its OWN constraint or behaviour is not
          // redundant — a unique or partial or TTL index is doing a second job
          // that the longer one does not do.
          const carriesItsOwnJob = ['unique', 'partialFilterExpression', 'expireAfterSeconds', 'sparse'].some(
            (o) => a.opts[o] !== undefined,
          );
          if (carriesItsOwnJob) continue;

          redundant.push(`${name}: {${a.keys.join(',')}} is a prefix of {${b.keys.join(',')}}`);
        }
      }
    }

    expect(redundant).toEqual([]);
  });
});
