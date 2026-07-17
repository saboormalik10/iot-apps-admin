/**
 * Timestamp parser for the CSV import path.
 *
 * Deliberately NOT the shared `parseTimestampMs` (measure-parser.util): that one
 * falls back to `Date.now()` for anything unparseable, which is defensible on the
 * mobile sync/NMEA path (never drop a live measure) but is wrong twice over here:
 *   1. `Date.parse('1737000000000')` is NaN, so a bare epoch — exactly what the
 *      MET exporter writes — was rewritten to the import time, silently shifting
 *      every backfilled row to today.
 *   2. It never returns NaN, so the caller's `Number.isFinite` skip-guard could
 *      never fire and a corrupt file reported `{ skipped: 0, errors: [] }`.
 *
 * Accepts both shapes the system actually produces:
 *   - bare epoch milliseconds ("1737000000000") — what MET/NEP export emit
 *   - ISO-8601, or "YYYY-MM-DD HH:mm:ss" — hand-written / third-party files
 * Returns NaN for anything else so the caller skips the row and reports it.
 *
 * Bare digits are read as milliseconds, never seconds: that matches the exporters
 * and the NEP importer's long-standing `Number()` behaviour. Guessing at seconds
 * would silently reinterpret existing files.
 */
export function parseImportTimestampMs(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;
  if (/^-?\d+$/.test(s)) return Number(s);
  return Date.parse(s.replace(' ', 'T'));
}
