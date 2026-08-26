import { localDayBounds, localDayKey, localDaysInSpan, isValidTimeZone } from '../src/utils/tz.util';

/**
 * Local-day arithmetic (M13 W3). Pure — no app, no database.
 *
 * These matter because the existing rollup buckets by UTC day, which for an
 * Australian customer cuts their day at 10am. Getting this wrong does not throw;
 * it silently attributes a morning's readings to the previous day.
 *
 * The DST cases are the ones worth having: Sydney/Melbourne shift between +10 and
 * +11, so two days a year are 23 and 25 hours long and no fixed-offset arithmetic
 * can be right about them.
 */

const SYD = 'Australia/Sydney';
const MEL = 'Australia/Melbourne';
const HOUR = 3_600_000;

describe('isValidTimeZone', () => {
  it('accepts real IANA zones', () => {
    expect(isValidTimeZone(SYD)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects nonsense rather than throwing later', () => {
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('localDayKey', () => {
  it('uses the LOCAL calendar date, not the UTC one', () => {
    // 2026-08-19T18:09Z is 2026-08-20T04:09 in Sydney (+10). This exact case
    // came out of a real ingest — the file was 04:09 local, 18:09 the day before UTC.
    const ts = Date.parse('2026-08-19T18:09:00Z');
    expect(localDayKey(ts, SYD)).toBe('2026-08-20');
    expect(localDayKey(ts, 'UTC')).toBe('2026-08-19');
  });

  it('agrees with the +10:00 offset the station actually sends', () => {
    expect(localDayKey(Date.parse('2026-08-20T04:09:00+10:00'), SYD)).toBe('2026-08-20');
  });

  it('puts local midnight on the right day at both edges', () => {
    expect(localDayKey(Date.parse('2026-08-20T00:00:00+10:00'), SYD)).toBe('2026-08-20');
    expect(localDayKey(Date.parse('2026-08-20T23:59:59+10:00'), SYD)).toBe('2026-08-20');
  });

  it('treats Melbourne and Sydney alike — they share an offset', () => {
    const ts = Date.parse('2026-08-19T18:09:00Z');
    expect(localDayKey(ts, MEL)).toBe(localDayKey(ts, SYD));
  });
});

describe('localDayBounds', () => {
  it('spans exactly 24h on an ordinary day', () => {
    const { startMs, endMs } = localDayBounds('2026-08-20', SYD);
    expect(endMs - startMs).toBe(24 * HOUR);
    expect(new Date(startMs).toISOString()).toBe('2026-08-19T14:00:00.000Z'); // 00:00 +10
  });

  it('round-trips: the start of a day belongs to that day', () => {
    for (const key of ['2026-01-15', '2026-06-30', '2026-08-20', '2026-12-31']) {
      expect(localDayKey(localDayBounds(key, SYD).startMs, SYD)).toBe(key);
    }
  });

  it('gives a 23-hour day when DST starts', () => {
    // Sydney springs forward on the first Sunday of October: 2am → 3am.
    const { startMs, endMs } = localDayBounds('2026-10-04', SYD);
    expect(endMs - startMs).toBe(23 * HOUR);
  });

  it('gives a 25-hour day when DST ends', () => {
    // Sydney falls back on the first Sunday of April: 3am → 2am.
    const { startMs, endMs } = localDayBounds('2026-04-05', SYD);
    expect(endMs - startMs).toBe(25 * HOUR);
  });

  it('is exactly 24h everywhere in UTC, which has no DST', () => {
    const { startMs, endMs } = localDayBounds('2026-10-04', 'UTC');
    expect(endMs - startMs).toBe(24 * HOUR);
    expect(new Date(startMs).toISOString()).toBe('2026-10-04T00:00:00.000Z');
  });
});

describe('localDaysInSpan', () => {
  it('returns the single day for a span inside one', () => {
    const from = Date.parse('2026-08-20T01:00:00+10:00');
    const to = Date.parse('2026-08-20T23:00:00+10:00');
    expect(localDaysInSpan(from, to, SYD)).toEqual(['2026-08-20']);
  });

  it('returns every day a span crosses', () => {
    const from = Date.parse('2026-08-18T22:00:00+10:00');
    const to = Date.parse('2026-08-21T02:00:00+10:00');
    expect(localDaysInSpan(from, to, SYD)).toEqual(['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']);
  });

  it('handles a span crossing local midnight — the case a rollup would miss', () => {
    const from = Date.parse('2026-08-19T23:59:00+10:00');
    const to = Date.parse('2026-08-20T00:01:00+10:00');
    expect(localDaysInSpan(from, to, SYD)).toEqual(['2026-08-19', '2026-08-20']);
  });

  it('spans the DST boundary without dropping or duplicating a day', () => {
    const from = Date.parse('2026-10-03T12:00:00+10:00');
    const to = Date.parse('2026-10-05T12:00:00+11:00');
    expect(localDaysInSpan(from, to, SYD)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05']);
  });

  it('returns nothing for a reversed span rather than looping', () => {
    const now = Date.now();
    expect(localDaysInSpan(now, now - 1000, SYD)).toEqual([]);
  });
});
