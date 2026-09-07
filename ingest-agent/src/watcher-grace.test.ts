import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { Watcher } from './watcher';
import { AgentConfig } from './config';

/**
 * The grace period must be measured on a clock the agent actually shares with
 * the file.
 *
 * It used to be measured from the minute in the FILENAME, which the logger
 * writes in the STATION's local time while `minuteFromName` builds it as UTC.
 * For the Sydney station (+10) that placed every file ten hours in the future,
 * so `now - minute` was negative and the five-minute grace period could not
 * elapse until real time caught up.
 *
 * Measured on the live station before this fix: 200 of 756 files took the late
 * path, and EVERY one of them arrived 605.0-605.1 minutes after its readings —
 * 600 for the offset plus 5 for the grace. The alert each should have raised was
 * that late with it.
 *
 * Filesystem-backed on purpose: the defect was in how a stat result was compared
 * to a parsed filename, so nothing short of real files and real mtimes pins it.
 */

let root: string;
let cfg: AgentConfig;

/** A truncated minute — fails gate 3, so only the grace period can release it. */
const TRUNCATED =
  'timestamp,direction,speed,units,status\r\n' +
  ['00', '01', '02'].map((s) => `2026-08-20T04:09:${s}+10:00,291,1.80,K,A`).join('\r\n') +
  '\r\n';

async function put(rel: string, body: string, ageMs: number): Promise<void> {
  const path = join(cfg.uploadDir, rel);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, body, 'utf8');
  const when = new Date(Date.now() - ageMs);
  await utimes(path, when, when);
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'agent-grace-'));
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

describe('the grace period does not depend on the station timezone', () => {
  test('releases a truncated file whose name is HOURS AHEAD of UTC', async () => {
    // 22:13 local at a +10 station is 12:13 UTC. Named as if it were UTC it sits
    // ten hours in the future, which is what stalled the old check.
    const ahead = new Date(Date.now() + 10 * 60 * 60 * 1000);
    const name = `WindSonic_${ahead.getUTCFullYear()}${String(ahead.getUTCMonth() + 1).padStart(2, '0')}${String(
      ahead.getUTCDate(),
    ).padStart(2, '0')}_${String(ahead.getUTCHours()).padStart(2, '0')}${String(ahead.getUTCMinutes()).padStart(2, '0')}.csv`;

    await put(name, TRUNCATED, 60_000); // untouched for a minute — well past lateMs

    const found = await new Watcher(cfg).findStable(async () => TRUNCATED);
    const c = found.find((x) => x.name === name);
    assert.ok(c, `a file idle for 60s must be released; got ${JSON.stringify(found.map((f) => f.name))}`);
    assert.equal(c!.partial, true, 'released by the grace period, so flagged partial');
  });

  test('releases one whose name is hours BEHIND UTC too', async () => {
    // The mirror case: a station west of UTC. Reading the name as UTC would
    // release these EARLY, accepting genuinely truncated files.
    const behind = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const name = `WindSonic_${behind.getUTCFullYear()}${String(behind.getUTCMonth() + 1).padStart(2, '0')}${String(
      behind.getUTCDate(),
    ).padStart(2, '0')}_${String(behind.getUTCHours()).padStart(2, '0')}${String(behind.getUTCMinutes()).padStart(2, '0')}.csv`;

    await put(name, TRUNCATED, 60_000);

    const found = await new Watcher(cfg).findStable(async () => TRUNCATED);
    assert.ok(found.some((x) => x.name === name));
  });

  test('still HOLDS a truncated file that was only just written', async () => {
    // The gate must keep working: a file still being written has to wait, or the
    // fix trades a ten-hour delay for permanently truncated data.
    await put('WindSonic_20260820_0411.csv', TRUNCATED, 1200); // past stableMs, inside lateMs
    const found = await new Watcher(cfg).findStable(async () => TRUNCATED);
    assert.ok(
      !found.some((x) => x.name === 'WindSonic_20260820_0411.csv'),
      'a freshly-written truncated file must not be taken yet',
    );
  });
});
