import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * RETENTION POLICY: the agent never deletes an uploaded file.
 *
 * The client's instruction (25 Aug 2026) is that files are kept permanently,
 * even once their readings are in the database. That is a promise about
 * behaviour that no ordinary unit test would catch being broken — a stray
 * `unlink` added later would simply start destroying the customer's data.
 *
 * So this scans the source. It is a policy test, deliberately.
 */

const SRC = __dirname;
const DEPLOY = join(__dirname, '..', 'deploy');

/** Filesystem calls that destroy data. */
const DESTRUCTIVE = [/\bunlink\b/, /\brmdir\b/, /\brm\b\s*\(/, /\brimraf\b/, /\bfs\.rm\b/, /\bpromises\.rm\b/];

/**
 * Strip comments before scanning.
 *
 * `paths.ts` explains the design with the phrase "never copy-then-unlink" — the
 * prose is the opposite of a violation, and matching it would make the guardrail
 * fire on its own documentation.
 */
function code(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the agent never deletes an uploaded file', () => {
  const sources = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  test('no source file calls a destructive filesystem operation', () => {
    for (const file of sources) {
      const body = code(readFileSync(join(SRC, file), 'utf8'));
      for (const pattern of DESTRUCTIVE) {
        assert.equal(pattern.test(body), false, `${file} contains a destructive call matching ${pattern}`);
      }
    }
  });

  test('files leave a directory only by rename, never by removal', () => {
    // `rename(2)` is the only way a file moves between upload/, staging/,
    // archive/ and quarantine/ — it relocates, it does not destroy.
    const paths = code(readFileSync(join(SRC, 'paths.ts'), 'utf8'));
    assert.match(paths, /\brename\b/);
    assert.equal(/\bunlink\b/.test(paths), false);
  });

  test('the deploy directory ships no prune unit', () => {
    // A timer that deletes is the single most dangerous thing that could be
    // reintroduced here, because it would run unattended.
    const files = existsSync(DEPLOY) ? readdirSync(DEPLOY) : [];
    const prune = files.filter((f) => /prune/i.test(f));
    assert.deepEqual(prune, [], `deploy/ contains prune unit(s): ${prune.join(', ')}`);
  });

  test('no deploy script deletes files', () => {
    const files = existsSync(DEPLOY) ? readdirSync(DEPLOY) : [];
    for (const file of files) {
      const body = code(readFileSync(join(DEPLOY, file), 'utf8')).replace(/^\s*#.*$/gm, '');
      // `-delete` and `rm` inside a shell script are what a prune looks like.
      assert.equal(/-delete\b/.test(body), false, `${file} uses find -delete`);
      assert.equal(/^\s*rm\s/m.test(body), false, `${file} calls rm`);
    }
  });
});
