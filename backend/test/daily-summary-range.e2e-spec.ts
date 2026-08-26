import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { MetDailySummary } from '../src/models/MetDailySummary';
import { Organization } from '../src/models/Organization';
import { DailySummaryService } from '../src/analytics/daily-summary.service';
import { localDayBounds, localDayKey } from '../src/utils/tz.util';

/**
 * Regression tests for the daily-summary read path (M14 W4).
 *
 * TWO REAL BUGS, both found against the live database:
 *
 * 1. `parseRange` quantised `from` with `Math.floor(ms / DAY_MS) * DAY_MS`, i.e.
 *    to UTC midnight, and compared it against a stored `dateMs` that is LOCAL
 *    midnight. At +10 that is 14:00 the previous UTC day, so asking for "from UTC
 *    midnight of the 18th" excluded the 18th's own summary — 5 of 6 summaries
 *    came back with the first day silently missing.
 *
 * 2. The unique key was `{ deviceId, dateMs }`, a millisecond instant, so two
 *    callers deriving the day-start differently wrote TWO rows for one calendar
 *    day. 2026-08-21 existed twice, at 14:00:00 and 14:02:00.
 *
 * Both are now keyed on the local 'YYYY-MM-DD' string.
 */

jest.setTimeout(60_000);

const SYD = 'Australia/Sydney';

describe('daily summary range and keying', () => {
  const deviceId = new Types.ObjectId();
  const organizationId = new Types.ObjectId();
  let svc: DailySummaryService;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    svc = new DailySummaryService();

    // A throwaway org so the timezone lookup resolves without touching real data.
    await Organization.create({
      _id: organizationId,
      name: 'Range Test Org',
      slug: `range-test-${Date.now()}`,
      contactEmail: 'test@example.com',
      country: 'AU',
      timezone: SYD,
    });

    // Three consecutive LOCAL days, keyed the way the ingest path keys them.
    for (const date of ['2026-08-18', '2026-08-19', '2026-08-20']) {
      const { startMs } = localDayBounds(date, SYD);
      await MetDailySummary.create({
        organizationId,
        deviceId,
        date,
        dateMs: startMs,
        sampleCount: 100,
        computedAt: new Date(),
      });
    }
  });

  afterAll(async () => {
    await MetDailySummary.deleteMany({ deviceId });
    await Organization.deleteOne({ _id: organizationId });
    await mongoose.disconnect();
  });

  it('stores dateMs at LOCAL midnight, not UTC midnight', async () => {
    const row = await MetDailySummary.findOne({ deviceId, date: '2026-08-18' }).lean();
    // 00:00 +10 on the 18th is 14:00Z on the 17th.
    expect(new Date(row!.dateMs).toISOString()).toBe('2026-08-17T14:00:00.000Z');
  });

  it('returns the first day when asked from UTC midnight of that date', async () => {
    // This is the exact query that used to drop the first day.
    const fromMs = Date.parse('2026-08-18T00:00:00Z');
    const toMs = Date.parse('2026-08-21T00:00:00Z');
    const rows = await svc.getMetDailySummaries(String(organizationId), String(deviceId), String(fromMs), String(toMs));

    expect(rows.map((r) => r.date)).toEqual(['2026-08-18', '2026-08-19', '2026-08-20']);
  });

  it('returns the first day when asked from LOCAL midnight of that date', async () => {
    const { startMs } = localDayBounds('2026-08-18', SYD);
    const rows = await svc.getMetDailySummaries(
      String(organizationId),
      String(deviceId),
      String(startMs),
      String(Date.parse('2026-08-21T00:00:00Z')),
    );
    expect(rows.map((r) => r.date)).toContain('2026-08-18');
  });

  it('respects the upper bound in local terms', async () => {
    const from = localDayBounds('2026-08-18', SYD).startMs;
    // Mid-morning on the 19th, local — the 20th must not appear.
    const to = Date.parse('2026-08-19T10:00:00+10:00');
    const rows = await svc.getMetDailySummaries(String(organizationId), String(deviceId), String(from), String(to));
    expect(rows.map((r) => r.date)).toEqual(['2026-08-18', '2026-08-19']);
  });

  it('rejects a second row for the same local day', async () => {
    // The duplicate bug: a different dateMs for the same calendar date.
    await expect(
      MetDailySummary.create({
        organizationId,
        deviceId,
        date: '2026-08-18',
        dateMs: localDayBounds('2026-08-18', SYD).startMs + 120_000, // 2 minutes later
        sampleCount: 1,
        computedAt: new Date(),
      }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('agrees with localDayKey on which day an instant belongs to', () => {
    // 18:09Z is 04:09 the NEXT day in Sydney — the case that produced a real
    // dayKey of 2026-08-20 during ingest.
    expect(localDayKey(Date.parse('2026-08-19T18:09:00Z'), SYD)).toBe('2026-08-20');
  });
});
