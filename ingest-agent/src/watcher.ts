import { readdir, stat } from 'fs/promises';
import { matchesPrefix } from './paths';
import { join } from 'path';

import { AgentConfig } from './config';
import { log } from './log';

/**
 * Decides when an uploaded file has finished arriving.
 *
 * This is the hard problem in the agent. A file appears the instant SFTP opens
 * it, long before the last byte lands — reading too early truncates it, and
 * because the logger never re-uploads, a file truncated on our side is truncated
 * forever.
 *
 * Detecting "still held open" properly would need `lsof` or `/proc/<pid>/fd` on
 * another user's process, which is privilege the agent should not have. So the
 * decision uses one filesystem signal plus two semantic ones that are decidable
 * from the bytes themselves.
 *
 *   Gate 1 — quiescence: size and mtime unchanged between polls, and mtime is at
 *            least STABLE_MS old.
 *   Gate 2 — structural: the file ends with a line terminator. A write cut
 *            mid-row does not.
 *   Gate 3 — semantic: the filename encodes a minute, and a complete 1 Hz file
 *            for minute M runs to at least second 59.
 *
 * Gate 3 has an escape hatch. The station's uploader has a known bug — it runs on
 * a drifting ~61s timer and uploads the current file while it is still being
 * written — so roughly half of all files are permanently short. Waiting longer
 * never recovers bytes that were never sent. After LATE_MS the file is accepted
 * as-is and flagged `partial`: 47 of 60 rows beats 0 of 60.
 */

/**
 * How far below the upload root to look.
 *
 * The agreed layout is `<Customer>/<Tower>/file.csv` — two levels — and 3 leaves
 * room for one future grouping level without becoming an unbounded walk of a
 * directory other processes also write to.
 */
const MAX_DEPTH = 3;

/** Split a relative path into the Candidate's identity fields. */
function candidate(rel: string, path: string, size: number, mtimeMs: number, partial: boolean): Candidate {
  const slash = rel.lastIndexOf('/');
  return {
    name: slash === -1 ? rel : rel.slice(slash + 1),
    rel,
    folder: slash === -1 ? '' : rel.slice(0, slash),
    path,
    size,
    mtimeMs,
    partial,
  };
}

export interface Candidate {
  /** Basename, e.g. `WindSonic_20260825_1119.csv`. */
  name: string;
  /**
   * Path relative to the upload root, POSIX separators, e.g.
   * `Observator/Demo Tower/WindSonic_20260825_1119.csv`.
   *
   * This — not `name` — identifies the file: the same filename occurs in every
   * tower folder, since the logger names by minute.
   */
  rel: string;
  /** Folder relative to the upload root, `''` for the flat legacy layout. */
  folder: string;
  path: string;
  size: number;
  mtimeMs: number;
  /** True when accepted only because the grace period expired. */
  partial: boolean;
}

interface Seen {
  size: number;
  mtimeMs: number;
  firstSeenAt: number;
}

/** `WindSonic_20260820_0409.csv` / `wind_20260820_0409.csv` → the minute it covers. */
const NAME_MINUTE = /_(\d{8})_(\d{4})\.csv$/i;

export function minuteFromName(name: string): number | null {
  const m = NAME_MINUTE.exec(name);
  if (!m) return null;
  const [, d, hm] = m;
  const year = Number(d.slice(0, 4));
  const month = Number(d.slice(4, 6));
  const day = Number(d.slice(6, 8));
  const hour = Number(hm.slice(0, 2));
  const min = Number(hm.slice(2, 4));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || min > 59) return null;
  // The name is in the station's LOCAL time and we do not know its offset here,
  // so this is only ever used as an age heuristic, never as a timestamp. The
  // authoritative time is the ISO offset inside each row.
  return Date.UTC(year, month - 1, day, hour, min);
}

/** Gate 2 — did the writer finish a line? */
export function endsCleanly(text: string): boolean {
  return /\r?\n$/.test(text);
}

/** Gate 3 — does the last data row reach the end of its minute? */
export function looksComplete(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return false;
  const last = lines[lines.length - 1];
  // `2026-08-20T04:09:59+10:00,...` — seconds are chars 17-19 of the ISO stamp.
  const m = /T\d{2}:\d{2}:(\d{2})/.exec(last);
  if (!m) return false;
  return Number(m[1]) >= 59;
}

export class Watcher {
  private readonly seen = new Map<string, Seen>();

  constructor(private readonly cfg: AgentConfig) {}

  /**
   * Relative paths of every .csv within MAX_DEPTH levels of `dir`.
   *
   * Sorted by the caller; within a folder the filename is chronological, and
   * grouping by folder happens downstream, so ordering across folders does not
   * matter here.
   */
  private async walk(dir: string, prefix: string, depth: number): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      log.error(`cannot read ${dir}: ${String(err)}`);
      return [];
    }

    const out: string[] = [];
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isFile()) {
        /**
         * Only files whose name starts with a configured prefix (default
         * `WindSonic_`). Anything else is left where it is — not claimed, not
         * moved, not deleted.
         *
         * The station drops several kinds of file into the same folder, and the
         * backend picks its parser from the FOLDER, so a file of another kind is
         * parsed as wind and quietly mis-stored: `Environmental_*` loses humidity
         * (the registry expects `humidity_pct`, the file says `humidity_percent`)
         * and the retired `EnvDiagnostic_*` wrote ~60 all-null rows a minute.
         * Neither is rejected, because both carry a `timestamp` column.
         *
         * This is the narrow fix. Per-prefix stream routing replaces it, and the
         * skipped files stay on disk to be backfilled when it lands.
         */
        if (e.name.toLowerCase().endsWith('.csv') && matchesPrefix(e.name, this.cfg.filePrefixes)) {
          out.push(rel);
        }
      } else if (e.isDirectory()) {
        if (depth >= MAX_DEPTH) {
          log.warn(`not descending past ${MAX_DEPTH} levels — skipping ${rel}/`);
          continue;
        }
        out.push(...(await this.walk(join(dir, e.name), rel, depth + 1)));
      }
    }
    return out;
  }

  /**
   * Files in `upload/` that are safe to take, oldest first.
   *
   * Sorted by filename, which is chronological because the name encodes the
   * minute — so a catch-up batch replays in the order the readings happened.
   */
  async findStable(readFile: (p: string) => Promise<string>): Promise<Candidate[]> {
    let entries;
    try {
      entries = await readdir(this.cfg.uploadDir, { withFileTypes: true });
    } catch (err) {
      log.error(`cannot read ${this.cfg.uploadDir}: ${String(err)}`);
      return [];
    }

    // SUBDIRECTORY POLICY: descend, because the layout IS subdirectories.
    // The client confirmed (25 Aug) that routing is by folder —
    // `/upload/<Customer>/<Tower>/` — so the earlier top-level-only scan would
    // now ingest nothing at all, and would say so only in a warning.
    //
    // Depth is capped at MAX_DEPTH: an unbounded walk on a directory somebody
    // else also writes to is how an agent ends up ingesting a backup tree.
    const names = (await this.walk(this.cfg.uploadDir, '', 0)).sort();

    const now = Date.now();
    const out: Candidate[] = [];

    for (const name of names) {
      // Bounded slice per poll — see `maxCandidatesPerTick`. Breaking (not
      // continuing) matters: `names` is sorted oldest-first, so stopping here
      // takes the oldest files and leaves the rest for the next tick, which is
      // the order a catch-up must replay in.
      if (out.length >= this.cfg.maxCandidatesPerTick) {
        log.info(`backlog: taking ${out.length} of ${names.length} this pass`);
        break;
      }

      // `name` is a RELATIVE PATH here; join handles the separators.
      const path = join(this.cfg.uploadDir, name);
      let st;
      try {
        st = await stat(path);
      } catch {
        continue; // vanished between readdir and stat
      }

      const prev = this.seen.get(name);
      // Unchanged since the previous poll. On a first sighting there is nothing
      // to compare against, so this is vacuously true and the mtime age below
      // carries the decision on its own — otherwise `--once` could never take a
      // file, and a restart would have to wait a full extra poll for every file
      // already sitting in the directory.
      const unchanged = prev === undefined || (prev.size === st.size && prev.mtimeMs === st.mtimeMs);
      this.seen.set(name, {
        size: st.size,
        mtimeMs: st.mtimeMs,
        firstSeenAt: prev?.firstSeenAt ?? now,
      });

      // Gate 1. An mtime older than STABLE_MS means nothing has written to the
      // file in that window, which is the actual signal we want; the comparison
      // above is belt-and-braces for filesystems with coarse mtime resolution.
      if (!unchanged || now - st.mtimeMs < this.cfg.stableMs) continue;

      let text: string;
      try {
        text = await readFile(path);
      } catch (err) {
        log.warn(`cannot read ${name}: ${String(err)}`);
        continue;
      }

      // Gates 2 and 3
      const complete = endsCleanly(text) && looksComplete(text);
      if (complete) {
        out.push(candidate(name, path, st.size, st.mtimeMs, false));
        continue;
      }

      // Grace period, measured from the minute the name claims — an independent
      // clock reading, so it still works if mtime is odd.
      const minute = minuteFromName(name);
      const age = minute !== null ? now - minute : now - st.mtimeMs;
      if (age > this.cfg.lateMs) {
        out.push(candidate(name, path, st.size, st.mtimeMs, true));
      }
    }

    // Forget files that are gone, so the map cannot grow without bound.
    const live = new Set(names);
    for (const key of this.seen.keys()) if (!live.has(key)) this.seen.delete(key);

    return out;
  }
}
