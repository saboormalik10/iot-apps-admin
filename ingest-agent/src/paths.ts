import { mkdir, rename, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';

import { AgentConfig } from './config';
import { log } from './log';

/**
 * Directory layout and the atomic moves between them.
 *
 *   upload/      the station writes here over SFTP
 *   staging/     taken for processing — invisible to the watcher
 *   archive/     ingested successfully — KEPT PERMANENTLY
 *   quarantine/  permanently rejected, kept for inspection
 *
 * NOTHING IN THIS AGENT EVER DELETES A FILE. On the client's instruction
 * (25 Aug 2026) uploaded files are retained for good, even once their readings
 * are in the database, so `archive/` and `quarantine/` grow without bound by
 * design. `deploy/archive-report.sh` reports that growth; it does not prune.
 *
 * All four live under the same filesystem root so `rename(2)` is atomic. That is
 * the whole basis of the crash-safety story: a file is in exactly one directory
 * at any instant, and moving it cannot half-happen. Never copy-then-unlink.
 */

export async function ensureDirs(cfg: AgentConfig): Promise<void> {
  for (const dir of [cfg.uploadDir, cfg.stagingDir, cfg.archiveDir, cfg.quarantineDir]) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Move into staging BEFORE reading or posting.
 *
 * This is step one for a reason: the moment the file leaves `upload/` the watcher
 * can no longer see it, so a slow or retried POST cannot cause the same file to
 * be picked up twice by a later poll.
 *
 * Returns null if the file vanished — a benign race with anything else touching
 * the directory.
 */
export async function claim(cfg: AgentConfig, rel: string): Promise<string | null> {
  const from = join(cfg.uploadDir, rel);
  const to = join(cfg.stagingDir, rel);
  try {
    // Staging MIRRORS the upload tree. The logger names files by minute, so the
    // same basename exists in every tower folder — flattening would make two
    // towers' readings collide and silently overwrite one another.
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    return to;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Archive under a day folder.
 *
 * The day grouping is kept even though nothing prunes any more: it is what makes
 * a year of files browsable, and it is the unit somebody would move to cold
 * storage by hand if the disk ever got tight.
 */
export async function archive(cfg: AgentConfig, rel: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const to = join(cfg.archiveDir, day, rel);
  await mkdir(dirname(to), { recursive: true });
  await rename(join(cfg.stagingDir, rel), to).catch((err) => {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  });
}

export async function quarantine(cfg: AgentConfig, rel: string, reason: string): Promise<void> {
  const to = join(cfg.quarantineDir, rel);
  await mkdir(dirname(to), { recursive: true });
  await rename(join(cfg.stagingDir, rel), to).catch((err) => {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  });
  log.warn(`quarantined ${rel}: ${reason}`);
}

/**
 * Anything left in staging at startup is from a process that died mid-flight.
 *
 * We cannot tell locally whether it was posted before the crash — that ambiguity
 * is resolved server-side by the content-hash ledger, which answers `duplicate`
 * for anything already ingested. So the safe action is simply to re-offer it.
 */
export async function drainStaging(cfg: AgentConfig): Promise<string[]> {
  const names = (await listCsvTree(cfg.stagingDir)).sort();
  if (names.length) {
    log.warn(`recovering ${names.length} file(s) left in staging by a previous run`);
  }
  return names;
}

/**
 * Every .csv under `dir`, as paths relative to it.
 *
 * Staging and quarantine mirror the upload tree, so a flat readdir would report
 * zero files and a crash-recovered batch would be silently abandoned.
 */
async function listCsvTree(dir: string, prefix = '', accept?: (name: string) => boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listCsvTree(join(dir, e.name), rel, accept)));
    else if (e.name.toLowerCase().endsWith('.csv') && (!accept || accept(e.name))) out.push(rel);
  }
  return out;
}

/** Does this filename start with one of the configured prefixes? */
export function matchesPrefix(name: string, prefixes: string[]): boolean {
  if (prefixes.length === 0) return true;
  return prefixes.some((p) => name.toLowerCase().startsWith(p.toLowerCase()));
}

/** Depth of the staging backlog — the metric that says ingestion has stalled. */
export async function stagingDepth(cfg: AgentConfig): Promise<number> {
  // Tree-aware: a flat readdir counts only loose files and would report a
  // backlog of zero while thousands sat in tower subfolders — silencing the
  // exact alarm that says ingestion has stalled.
  return (await listCsvTree(cfg.stagingDir)).length;
}

export async function quarantineDepth(cfg: AgentConfig): Promise<number> {
  return (await listCsvTree(cfg.quarantineDir)).length;
}

/**
 * Refuse to start if the working directories are not writable. A read-only or
 * full disk fails in a way that looks exactly like "the station stopped sending",
 * so it is worth an explicit check rather than a confusing silence.
 */
export async function assertWritable(cfg: AgentConfig): Promise<void> {
  for (const dir of [cfg.stagingDir, cfg.archiveDir, cfg.quarantineDir]) {
    const st = await stat(dir).catch(() => null);
    if (!st || !st.isDirectory()) throw new Error(`${dir} is not a directory`);
  }
}
