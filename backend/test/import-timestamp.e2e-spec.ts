import { parseImportTimestampMs } from '../src/import/parse-import-timestamp';

/**
 * Pure unit test for the CSV-import timestamp parser (no DB/app needed). Runs
 * under the same jest-e2e config via the `.e2e-spec.ts` suffix.
 *
 * Regression: the MET importer used the shared `parseTimestampMs`, whose
 * `Date.now()` fallback silently rewrote every exported epoch to the import time
 * AND defeated the caller's skip-guard, so a corrupt file reported success.
 */
describe('parseImportTimestampMs (unit)', () => {
  it('round-trips the bare epoch-ms the MET/NEP exporters write', () => {
    const exported = 1737000000000; // 2025-01-16T04:00:00.000Z
    expect(parseImportTimestampMs(String(exported))).toBe(exported);
  });

  it('parses ISO-8601', () => {
    expect(parseImportTimestampMs('2025-01-16T04:00:00.000Z')).toBe(1737000000000);
  });

  it('parses space-separated date-time', () => {
    expect(parseImportTimestampMs('2025-01-16 04:00:00.000Z')).toBe(1737000000000);
  });

  it('returns NaN for unparseable input so the caller can skip and report the row', () => {
    for (const bad of ['', '   ', 'not-a-date', 'NaN', undefined, null]) {
      expect(parseImportTimestampMs(bad as string)).toBeNaN();
    }
  });

  it('never silently falls back to now (the bug this replaces)', () => {
    const before = Date.now();
    const parsed = parseImportTimestampMs('garbage');
    expect(Number.isFinite(parsed)).toBe(false);
    // The old shared parser would have returned a value within ms of `before`.
    expect(parsed).not.toBeGreaterThanOrEqual(before);
  });

  it('reads bare digits as milliseconds, not seconds', () => {
    expect(parseImportTimestampMs('1737000000')).toBe(1737000000);
  });
});
