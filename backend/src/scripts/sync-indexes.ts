/**
 * Apply every model's declared indexes to the database (M23 W4).
 *
 * This is the counterpart to `autoIndex: false` in production. With autoIndex on,
 * Mongoose built indexes silently on first use of each model — which cost 13
 * `createIndexes` round trips at cold start and, worse, RESURRECTED indexes that
 * had been deliberately dropped (M23 W1). With it off, nothing creates an index
 * for a newly added model unless this script runs.
 *
 * Run it as a deploy step, after the new code is on disk and before it serves:
 *
 *   npm run sync:indexes            # create what is missing — never drops
 *   npm run sync:indexes -- --prune # ALSO drop indexes no longer declared
 *
 * Create-only is the default deliberately. Building an index the schema declares
 * is additive and safe to repeat; dropping one is not, and an index that quietly
 * disappears because someone edited a schema is how a hot query starts scanning a
 * collection with no error anywhere. `--prune` exists for the deliberate case and
 * names every index before it removes it.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const PRUNE = process.argv.includes('--prune');

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  // Importing a model file registers it — the models are plain `model()` calls,
  // so there is no Nest container to enumerate. Reading the directory means a new
  // model is covered the moment it is added, without editing a list here that
  // someone would forget.
  const dir = join(__dirname, '..', 'models');
  const files = readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'));
  for (const f of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    require(join(dir, f));
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  console.log(`${files.length} model files loaded → ${mongoose.modelNames().length} models registered\n`);

  let created = 0;
  let dropped = 0;
  let failed = 0;

  for (const name of mongoose.modelNames().sort()) {
    const model = mongoose.model(name);
    const coll = model.collection.collectionName;

    const before = new Set<string>();
    try {
      for (const ix of await model.collection.indexes()) before.add(ix.name as string);
    } catch {
      // Collection does not exist yet — createIndexes will create it.
    }

    try {
      if (PRUNE) await model.syncIndexes();
      else await model.createIndexes();
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${coll}: ${(err as Error).message}`);
      continue;
    }

    const after = new Set<string>();
    for (const ix of await model.collection.indexes()) after.add(ix.name as string);

    const added = [...after].filter((n) => !before.has(n));
    const removed = [...before].filter((n) => !after.has(n));
    created += added.length;
    dropped += removed.length;

    if (added.length || removed.length) {
      console.log(`  ${coll}`);
      for (const n of added) console.log(`    + ${n}`);
      for (const n of removed) console.log(`    − ${n}  (no longer declared)`);
    }
  }

  console.log(`\n  created ${created}   dropped ${dropped}   failed ${failed}`);
  if (!PRUNE && dropped === 0) {
    console.log('  (create-only — pass --prune to also remove undeclared indexes)');
  }

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
})();
