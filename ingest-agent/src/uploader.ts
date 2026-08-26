import { gzipSync } from 'zlib';

import { AgentConfig } from './config';
import { IngestBatchPayload, IngestFilePayload, IngestResponse, IngestFileResult } from './contract';
import { log } from './log';

/**
 * Posts batches to the API and classifies what comes back.
 *
 * Two rules shape this:
 *
 * 1. Batches go one at a time, never in parallel. Concurrent batches would race
 *    the day-record counter on the server and would deliver readings out of
 *    order. Sequential also gives back-pressure for free.
 *
 * 2. Retryable failures retry forever with backoff. The box has disk; files wait
 *    in staging. Giving up would mean discarding real measurements because the
 *    API happened to be down, which is never the right trade.
 */

export type Disposition = 'archive' | 'quarantine' | 'leave';

export interface BatchOutcome {
  ok: boolean;
  /** Per-file decision, keyed by filename. */
  dispositions: Map<string, { disposition: Disposition; result?: IngestFileResult }>;
  /** Set when the whole batch failed and should be retried later. */
  retryAfterMs?: number;
}

/** 413 is the one "permanent" status worth handling by splitting rather than dropping. */
export class PayloadTooLargeError extends Error {}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Exponential backoff with full jitter, capped at five minutes. */
export function backoffMs(attempt: number): number {
  const ceiling = Math.min(300_000, 2_000 * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

export function chunkFiles(files: IngestFilePayload[], cfg: AgentConfig): IngestFilePayload[][] {
  const batches: IngestFilePayload[][] = [];
  let current: IngestFilePayload[] = [];
  let bytes = 0;

  for (const f of files) {
    const size = Buffer.byteLength(f.content, 'utf8');
    const wouldExceed = current.length >= cfg.maxFilesPerRequest || bytes + size > cfg.maxBytesPerRequest;
    if (current.length > 0 && wouldExceed) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(f);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}

export class Uploader {
  constructor(private readonly cfg: AgentConfig) {}

  private get endpoint(): string {
    return `${this.cfg.apiBaseUrl}/v1/ingest/met/files`;
  }

  async post(files: IngestFilePayload[], folder = ''): Promise<BatchOutcome> {
    const payload: IngestBatchPayload = {
      account: this.cfg.account,
      folder,
      agentVersion: this.cfg.agentVersion,
      // `rel` is local bookkeeping; sending it would put a path the server never
      // asked for into every request body.
      files: files.map(({ rel: _rel, ...f }) => f),
    };

    // gzip is free on the receiving side — body-parser inflates gzipped request
    // bodies by default — and is worth 5-10x on a catch-up batch.
    const body = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.requestTimeoutMs);

    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          Authorization: `Bearer ${this.cfg.token}`,
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      // Network failure, DNS, timeout — always retryable.
      log.warn(`POST failed (network): ${String(err)}`);
      return { ok: false, dispositions: new Map() };
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 413) throw new PayloadTooLargeError('batch too large');

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (isRetryableStatus(res.status)) {
        log.warn(`POST ${res.status} — will retry: ${text.slice(0, 200)}`);
        return { ok: false, dispositions: new Map() };
      }
      // A permanent 4xx applies to the whole batch: bad credential, bad account.
      // Do NOT quarantine the files — the fault is configuration, not data, and
      // quarantining would discard good readings over a fixable mistake.
      log.error(`POST ${res.status} (permanent, batch left in staging): ${text.slice(0, 300)}`);
      return { ok: false, dispositions: new Map() };
    }

    const json = (await res.json()) as IngestResponse;
    const dispositions = new Map<string, { disposition: Disposition; result?: IngestFileResult }>();

    for (const result of json.data?.results ?? []) {
      let disposition: Disposition;
      switch (result.status) {
        case 'ingested':
        case 'duplicate':
          disposition = 'archive';
          break;
        case 'rejected':
          // Permanently unusable. Quarantining rather than retrying is what stops
          // one poison file blocking every file behind it forever.
          disposition = 'quarantine';
          break;
        case 'retry':
        default:
          disposition = 'leave';
          break;
      }
      dispositions.set(result.name, { disposition, result });
    }

    return { ok: true, dispositions };
  }
}
