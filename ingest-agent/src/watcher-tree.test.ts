import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readdir, utimes } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { Watcher } from './watcher';
import { claim, archive, drainStaging, matchesPrefix, stagingDepth } from './paths';
import { AgentConfig } from './config';

/**
 * Subdirectory walking (M19 W5).
 *
 * The client's layout is `/upload/<Customer>/<Tower>/`. The previous watcher
 * scanned only the top level and merely LOGGED a warning about subdirectories,
 * so the new layout would have ingested nothing while looking healthy — the
 * failure mode this file exists to prevent.
 *
 * Filesystem-backed, unlike the pure-logic tests in watcher.test.ts: the bug was
 * in directory traversal, so nothing less would catch it.
 */

let root: string;
let cfg: AgentConfig;

const OLD = new Date(Date.now() - 60 * 60 * 1000); // an hour old: past every gate

async function put(rel: string, body: string): Promise<void> {
  const path = join(cfg.uploadDir, rel);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, body, 'utf8');
  await utimes(path, OLD, OLD);
}

// A complete one-minute file: 60 rows ending on second 59.
const COMPLETE = [
  'timestamp,direction,speed,units,status',
  ...Array.from({ length: 60 }, (_, i) =>
    `2026-08-25T11:19:${String(i).padStart(2, '0')}+10:00,350,0.50,K,A`),
].join('\r\n') + '\r\n';

// Module-scoped, so BOTH suites share one tree: a per-describe `after` would
// delete the temp root before the staging suite ran.
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'agent-tree-'));
  cfg = {
    uploadDir: join(root, 'upload'),
    stagingDir: join(root, 'staging'),
    archiveDir: join(root, 'archive'),
    quarantineDir: join(root, 'quarantine'),
    stableMs: 1000,
    lateMs: 2000,
    filePrefixes: ['WindSonic_'],
    maxCandidatesPerTick: 200,
  } as AgentConfig;
  for (const d of [cfg.uploadDir, cfg.stagingDir, cfg.archiveDir, cfg.quarantineDir]) {
    await mkdir(d, { recursive: true });
  }
});

after(async () => rm(root, { recursive: true, force: true }));

describe('Watcher walks the tower tree', () => {
  test('finds a file two levels deep — the agreed <Customer>/<Tower> layout', async () => {
    await put('Observator/Demo Tower/WindSonic_20260825_1119.csv', COMPLETE);

    const found = await new Watcher(cfg).findStable(async () => COMPLETE);
    const rels = found.map((c) => c.rel);
    assert.ok(rels.includes('Observator/Demo Tower/WindSonic_20260825_1119.csv'), `got ${JSON.stringify(rels)}`);
  });

  test('reports the folder and the basename separately', async () => {
    const found = await new Watcher(cfg).findStable(async () => COMPLETE);
    const c = found.find((x) => x.rel.includes('Demo Tower'))!;
    assert.equal(c.folder, 'Observator/Demo Tower');
    assert.equal(c.name, 'WindSonic_20260825_1119.csv');
  });

  test('still finds a file in the flat root, so the legacy layout keeps working', async () => {
    await put('WindSonic_20260825_1120.csv', COMPLETE);
    const found = await new Watcher(cfg).findStable(async () => COMPLETE);
    const flat = found.find((c) => c.rel === 'WindSonic_20260825_1120.csv');
    assert.ok(flat, 'flat file not found');
    assert.equal(flat!.folder, '');
  });

  test('keeps same-named files in different towers apart', async () => {
    // The logger names by minute, so EVERY tower produces the same basename.
    // Flattening would make one silently overwrite the other.
    await put('Observator/Tower A/WindSonic_20260825_1121.csv', COMPLETE);
    await put('Observator/Tower B/WindSonic_20260825_1121.csv', COMPLETE);

    const found = await new Watcher(cfg).findStable(async () => COMPLETE);
    const same = found.filter((c) => c.name === 'WindSonic_20260825_1121.csv');
    assert.equal(same.length, 2);
    assert.deepEqual(same.map((c) => c.folder).sort(), ['Observator/Tower A', 'Observator/Tower B']);
  });

  test('does not descend past the depth cap', async () => {
    await put('a/b/c/d/TooDeep_20260825_1122.csv', COMPLETE);
    const found = await new Watcher(cfg).findStable(async () => COMPLETE);
    assert.ok(!found.some((c) => c.name.startsWith('TooDeep')), 'walked past the cap');
  });
});

describe('staging mirrors the tree', () => {
  test('claim preserves the folder, so two towers do not collide', async () => {
    const a = 'Observator/Tower A/WindSonic_20260825_1121.csv';
    const b = 'Observator/Tower B/WindSonic_20260825_1121.csv';

    assert.ok(await claim(cfg, a), 'claim A failed');
    assert.ok(await claim(cfg, b), 'claim B failed');

    // Both survive: a flat staging directory would have kept only one.
    assert.equal(await stagingDepth(cfg), 2);
    const staged = await drainStaging(cfg);
    assert.deepEqual(staged.sort(), [a, b].sort());
  });

  test('archive keeps the tower structure under the day folder', async () => {
    const rel = 'Observator/Tower A/WindSonic_20260825_1121.csv';
    await archive(cfg, rel);

    const day = new Date().toISOString().slice(0, 10);
    const towers = await readdir(join(cfg.archiveDir, day, 'Observator'));
    assert.ok(towers.includes('Tower A'), `archive flattened: ${JSON.stringify(towers)}`);
  });
});

/**
 * Filename filtering (M24, after the client's server was inspected).
 *
 * The station drops several kinds of file into ONE folder, and the backend picks
 * its parser from the folder — so anything that is not wind gets parsed as wind
 * and quietly mis-stored. Both offenders carry a `timestamp` column, so neither
 * is rejected; they fail by writing plausible-looking data.
 *
 * The agent must therefore take only what it is told to take, and must LEAVE the
 * rest untouched so it can be backfilled once per-prefix routing exists.
 */
describe('Watcher only claims configured prefixes', () => {
  test('picks up WindSonic_ and ignores Environmental_ / EnvDiagnostic_', async () => {
    await put('Observator/Demo Tower/WindSonic_20260901_0315.csv', COMPLETE);
    await put('Observator/Demo Tower/Environmental_20260901_0315.csv', COMPLETE);
    await put('Observator/Demo Tower/EnvDiagnostic_20260901_0315.csv', COMPLETE);

    const found = await new Watcher(cfg).findStable(async () => COMPLETE);
    const names = found.map((f) => f.rel.split('/').pop());

    assert.ok(names.includes('WindSonic_20260901_0315.csv'), `got ${JSON.stringify(names)}`);
    assert.ok(!names.some((n) => n!.startsWith('Environmental_')), 'environmental must be skipped');
    assert.ok(!names.some((n) => n!.startsWith('EnvDiagnostic_')), 'diagnostic must be skipped');
  });

  test('the skipped files are still on disk — nothing is moved or deleted', async () => {
    const dir = join(cfg.uploadDir, 'Observator/Demo Tower');
    const left = await readdir(dir);
    assert.ok(left.includes('Environmental_20260901_0315.csv'), `got ${JSON.stringify(left)}`);
    assert.ok(left.includes('EnvDiagnostic_20260901_0315.csv'), `got ${JSON.stringify(left)}`);
  });

  test('an empty prefix list means take everything', () => {
    assert.equal(matchesPrefix('Environmental_1.csv', []), true);
    assert.equal(matchesPrefix('Environmental_1.csv', ['WindSonic_']), false);
    assert.equal(matchesPrefix('windsonic_1.csv', ['WindSonic_']), true, 'case-insensitive');
  });
});

/**
 * `--dry-run` must not move anything (found on the live box, M24).
 *
 * The flag existed to inspect a new deployment safely, and it logged "nothing
 * will be posted or moved" — but `claim()` ran BEFORE the check, so a dry run
 * renamed every settled file into `staging/`. On the real server that was 19,000
 * files moved by a command whose whole purpose is to move nothing.
 */
describe('dry run leaves the tree untouched', () => {
  test('files stay in upload/ and staging stays empty', async () => {
    const dryCfg = { ...cfg, dryRun: true } as AgentConfig;
    await put('Observator/Dry Tower/WindSonic_20260901_0400.csv', COMPLETE);

    // findStable is what tick() consults; claiming is what must NOT happen.
    const found = await new Watcher(dryCfg).findStable(async () => COMPLETE);
    assert.ok(found.some((f) => f.rel.includes('Dry Tower')), 'the file should be seen');

    // The suites share one temp tree, so compare the DELTA rather than zero.
    const before = await stagingDepth(dryCfg);
    const stillThere = await readdir(join(dryCfg.uploadDir, 'Observator/Dry Tower'));
    assert.deepEqual(stillThere, ['WindSonic_20260901_0400.csv'], 'file must remain in upload/');
    assert.equal(await stagingDepth(dryCfg), before, 'a dry run must not add anything to staging');
  });
});

/**
 * A large backlog must not be taken in one bite (found on the live box, M24).
 *
 * `findStable` READS every candidate to check completeness. With 19,363 files
 * waiting, that allocated enough in a single pass to kill the agent with a V8
 * out-of-memory on a 416 MB instance — before one file had been sent. A backlog
 * is precisely when the agent has to keep working.
 */
describe('backlog is processed in bounded slices', () => {
  test('takes at most maxCandidatesPerTick, oldest first', async () => {
    const cap = 5;
    const slice = { ...cfg, maxCandidatesPerTick: cap } as AgentConfig;
    for (let i = 0; i < 12; i += 1) {
      const mm = String(i).padStart(2, '0');
      await put(`Observator/Backlog Tower/WindSonic_20260901_06${mm}.csv`, COMPLETE);
    }

    const found = await new Watcher(slice).findStable(async () => COMPLETE);
    assert.equal(found.length, cap, `expected ${cap}, got ${found.length}`);

    // Oldest first: filenames encode the minute, and the walk is sorted.
    const names = found.map((f) => f.rel.split('/').pop()!).filter((n) => n.startsWith('WindSonic_202609'));
    assert.deepEqual(names, [...names].sort(), 'must be chronological');
  });
});
