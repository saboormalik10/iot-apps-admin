import { readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

import { AgentConfig, loadConfig } from './config';
import { log } from './log';
import { Watcher } from './watcher';
import { archive, assertWritable, claim, drainStaging, ensureDirs, quarantine, quarantineDepth, stagingDepth } from './paths';
import { PayloadTooLargeError, Uploader, backoffMs, chunkFiles } from './uploader';
import { IngestFilePayload } from './contract';

/**
 * Observator ingest agent.
 *
 * Runs on the Lightsail box beside the SFTP drop, reads settled files, and posts
 * their bytes to the API. It deliberately does not parse: one parser, server-side,
 * means a fix ships with a backend deploy rather than a fleet-wide agent update,
 * and archived files stay re-ingestable through a corrected parser.
 *
 * The order of operations is the crash-safety story:
 *
 *   1. rename upload/F → staging/F     (atomic; F is now invisible to the watcher)
 *   2. read staging/F, hash, POST
 *   3. 2xx      → rename to archive/
 *      rejected → rename to quarantine/
 *      failure  → leave in staging/, retry with backoff
 *
 * If the process dies between 2 and 3 the file stays in staging and is re-offered
 * on restart. The server's content-hash ledger answers `duplicate`, so a re-offer
 * is harmless — which is exactly why the agent does not need to know whether the
 * POST that killed it had succeeded.
 */

const STAGING_ALARM = 2_000; // ≈33h of backlog at one file per minute

let stopping = false;
let consecutiveFailures = 0;

async function buildPayload(cfg: AgentConfig, rels: string[]): Promise<IngestFilePayload[]> {
  const out: IngestFilePayload[] = [];
  for (const rel of rels) {
    let content: string;
    try {
      content = await readFile(join(cfg.stagingDir, rel), 'utf8');
    } catch (err) {
      log.warn(`cannot read staged ${rel}: ${String(err)}`);
      continue;
    }
    if (!content.trim()) {
      await quarantine(cfg, rel, 'empty file');
      continue;
    }
    if (Buffer.byteLength(content, 'utf8') > 1_048_576) {
      await quarantine(cfg, rel, 'larger than 1 MB — anomalous for a one-minute file');
      continue;
    }
    // The server is told the basename; `rel` stays local for the disk moves.
    const slash = rel.lastIndexOf('/');
    out.push({
      name: slash === -1 ? rel : rel.slice(slash + 1),
      rel,
      content,
      sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
    });
  }
  return out;
}

/** Group staged files by their folder — one folder is one station. */
function byFolder(files: IngestFilePayload[]): Map<string, IngestFilePayload[]> {
  const groups = new Map<string, IngestFilePayload[]>();
  for (const f of files) {
    const rel = f.rel ?? f.name;
    const slash = rel.lastIndexOf('/');
    const folder = slash === -1 ? '' : rel.slice(0, slash);
    const bucket = groups.get(folder);
    if (bucket) bucket.push(f);
    else groups.set(folder, [f]);
  }
  return groups;
}

/** Sends one batch, splitting on 413. Returns false if it should be retried later. */
async function sendBatch(
  cfg: AgentConfig,
  uploader: Uploader,
  files: IngestFilePayload[],
  folder: string,
): Promise<boolean> {
  let outcome;
  try {
    outcome = await uploader.post(files, folder);
  } catch (err) {
    if (err instanceof PayloadTooLargeError && files.length > 1) {
      const mid = Math.ceil(files.length / 2);
      log.warn(`413 — splitting batch of ${files.length}`);
      const a = await sendBatch(cfg, uploader, files.slice(0, mid), folder);
      const b = await sendBatch(cfg, uploader, files.slice(mid), folder);
      return a && b;
    }
    if (err instanceof PayloadTooLargeError) {
      await quarantine(cfg, files[0].rel ?? files[0].name, 'single file exceeds the server body limit');
      return true;
    }
    throw err;
  }

  if (!outcome.ok) return false;

  let ingested = 0;
  let duplicate = 0;
  let rejected = 0;
  let left = 0;

  for (const file of files) {
    const entry = outcome.dispositions.get(file.name);
    if (!entry) {
      // The server said nothing about this file. Leave it staged rather than
      // guessing — the next poll will offer it again.
      left++;
      continue;
    }
    if (entry.disposition === 'archive') {
      await archive(cfg, file.rel ?? file.name);
      if (entry.result?.status === 'duplicate') duplicate++;
      else ingested += entry.result?.rows ?? 0;
    } else if (entry.disposition === 'quarantine') {
      await quarantine(cfg, file.rel ?? file.name, entry.result?.reason ?? 'rejected by server');
      rejected++;
    } else {
      left++;
    }
  }

  log.info(
    `batch ${files.length} file(s)${folder ? ` from ${folder}` : ''}: ` +
      `${ingested} rows ingested, ${duplicate} duplicate, ${rejected} rejected, ${left} left`,
  );
  return true;
}

async function tick(cfg: AgentConfig, watcher: Watcher, uploader: Uploader): Promise<void> {
  // Anything already staged goes first — it is older than anything in upload/.
  const staged = await drainStaging(cfg);

  const candidates = await watcher.findStable((p) => readFile(p, 'utf8'));

  /**
   * A dry run reports and returns BEFORE anything is claimed.
   *
   * It used to claim first and check `dryRun` afterwards, so the run it
   * advertises as "nothing will be posted or moved" renamed every settled file
   * into `staging/` — on the live box that was 19,000 files. The whole point of
   * the flag is to inspect a new deployment safely, so it has to be the first
   * thing that happens, not the last.
   */
  if (cfg.dryRun) {
    const names = [...staged, ...candidates.map((c) => c.rel)];
    log.info(
      `[dry-run] would claim and post ${names.length} file(s): ` +
        `${names.slice(0, 5).join(', ')}${names.length > 5 ? ' …' : ''}`,
    );
    log.info('[dry-run] nothing was moved');
    return;
  }

  const claimed: string[] = [...staged];

  for (const c of candidates) {
    if (stopping) break;
    const path = await claim(cfg, c.rel);
    if (path) {
      claimed.push(c.rel);
      if (c.partial) log.warn(`${c.rel} accepted as partial — the grace period expired`);
    }
  }

  if (claimed.length === 0) return;

  const payloads = await buildPayload(cfg, claimed);
  if (payloads.length === 0) return;

  // One request per FOLDER: the server emits a single MET_MEASURES event per
  // request and derives the device from the folder, so mixing two towers into
  // one batch would attribute both to whichever resolved first.
  //
  // Sequential within and across folders: parallel batches would race the
  // server's day-record counter and deliver readings out of order.
  for (const [folder, group] of byFolder(payloads)) {
    if (stopping) break;
    for (const batch of chunkFiles(group, cfg)) {
      if (stopping) break;
      const ok = await sendBatch(cfg, uploader, batch, folder);
      if (!ok) {
        consecutiveFailures++;
        return; // leave the rest staged; back off and try the whole lot again
      }
      consecutiveFailures = 0;
    }
  }

  // Named, because the agent now watches several customers and "staging backlog
  // is 900 files" is not actionable without knowing whose.
  const depth = await stagingDepth(cfg);
  if (depth > STAGING_ALARM) {
    log.error(`${cfg.account}: staging backlog is ${depth} files — ingestion is not keeping up`);
  }
  const qDepth = await quarantineDepth(cfg);
  if (qDepth > 0) log.warn(`${cfg.account}: ${qDepth} file(s) in quarantine awaiting inspection`);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  log.info(`observator-ingest-agent ${cfg.agentVersion}`);
  log.info(`  api       ${cfg.apiBaseUrl}`);
  for (const r of cfg.roots) log.info(`  watching  ${r.account} → ${r.uploadDir}`);
  if (cfg.dryRun) log.warn('  DRY RUN — nothing will be posted or moved');

  /**
   * One view per customer.
   *
   * `Watcher` holds per-file state between polls (the stability gates), so each
   * root needs its own — sharing one would let a file in one customer's tree
   * satisfy a gate using another's history. `AgentConfig` is spread over the
   * root's directories so everything downstream keeps taking a plain config.
   */
  const views = cfg.roots.map((r) => {
    const view: AgentConfig = { ...cfg, ...r };
    return { view, watcher: new Watcher(view), uploader: new Uploader(view) };
  });

  for (const { view } of views) {
    await ensureDirs(view);
    await assertWritable(view);
  }

  const shutdown = (signal: string) => {
    log.info(`${signal} — finishing the current batch then exiting`);
    stopping = true;
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  const tickAll = async () => {
    for (const { view, watcher, uploader } of views) {
      if (stopping) break;
      await tick(view, watcher, uploader);
    }
  };

  if (cfg.once) {
    await tickAll();
    log.info('--once complete');
    return;
  }

  while (!stopping) {
    try {
      await tickAll();
    } catch (err) {
      consecutiveFailures++;
      log.error(`tick failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    }

    // After repeated failures, slow right down rather than hammering a service
    // that is already unwell.
    const delay = consecutiveFailures >= 5 ? backoffMs(Math.min(consecutiveFailures, 8)) : cfg.pollIntervalMs;
    await new Promise((r) => setTimeout(r, delay));
  }

  log.info('stopped');
}

main().catch((err) => {
  log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
