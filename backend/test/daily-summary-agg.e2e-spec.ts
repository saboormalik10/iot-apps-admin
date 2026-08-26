import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { MetMeasure } from '../src/models/MetMeasure';
import { MetRecord } from '../src/models/MetRecord';
import { computeMetDaily, DAY_MS } from '../src/analytics/daily-summary.util';
import { computeMetDailyAggregated } from '../src/analytics/daily-summary-agg';

/**
 * Equivalence test for the aggregation rewrite (M14 W2).
 *
 * The rollup was moved from "load the whole day into Node and reduce" to a
 * MongoDB `$facet`, because the original took 9.5 seconds on a real 1 Hz day and
 * ran once per agent POST.
 *
 * A rewrite of arithmetic this fiddly — argmin/argmax tie rules, 16 direction
 * sectors, 13 Beaufort buckets, a median inter-sample gap — is only safe if it
 * is proven to produce the SAME answer. So this runs both implementations over
 * the same real ingested rows and compares field by field.
 *
 * Requires a database with ingested data; skips cleanly if there is none.
 */

const MET_FIELDS =
  'timestampMs windSpeedMs windDirTrueDeg windDirRelDeg tempC humidityPct pressureHpa precipMm precipRateMmHr solarWm2 dewPointC';

jest.setTimeout(120_000);

describe('daily rollup — aggregation matches the original implementation', () => {
  let recordIds: Types.ObjectId[] = [];
  let dayStartMs = 0;
  let dayEndMs = 0;
  let available = false;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    // Pick the day with the most ACTUAL rows — the more rows, the more the two
    // paths can diverge. `measureCount` is not used: it can drift from reality if
    // rows were ever written outside the ingest path.
    const biggest = await MetMeasure.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $group: { _id: '$recordId', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 1 },
    ]);
    if (!biggest.length) return;
    const record = await MetRecord.findById(biggest[0]._id).lean();
    if (!record) return;
    recordIds = [record._id as Types.ObjectId];
    dayStartMs = record.dateStartMs;
    dayEndMs = dayStartMs + DAY_MS;
    available = true;
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('produces identical output on real ingested data', async () => {
    if (!available) {
      console.warn('no ingested MET data — skipping equivalence check');
      return;
    }

    // Frozen so `completeness` sees the same window in both paths.
    const nowMs = Date.now();

    const rows = await MetMeasure.find({
      recordId: { $in: recordIds },
      rowType: 'data',
      timestampMs: { $gte: dayStartMs, $lt: dayEndMs },
    })
      .select(MET_FIELDS)
      .lean();

    const original = computeMetDaily(rows as never, dayStartMs, dayEndMs, nowMs);
    const aggregated = await computeMetDailyAggregated(recordIds, dayStartMs, dayEndMs, nowMs);

    expect(aggregated).not.toBeNull();
    expect(rows.length).toBeGreaterThan(0);

    // Compare every field explicitly rather than deep-equal, so a mismatch names
    // the field that broke instead of dumping two large objects.
    const keys = Object.keys(original) as (keyof typeof original)[];
    const mismatches: string[] = [];
    for (const key of keys) {
      const a = original[key];
      const b = (aggregated as Record<string, unknown>)[key];
      const same = Array.isArray(a) ? JSON.stringify(a) === JSON.stringify(b) : Object.is(a, b);
      if (!same) mismatches.push(`${String(key)}: original=${JSON.stringify(a)} aggregated=${JSON.stringify(b)}`);
    }

    expect(mismatches).toEqual([]);
  });

  it('returns null for a day with no rows, like the original', async () => {
    const empty = await computeMetDailyAggregated([new Types.ObjectId()], 0, DAY_MS, Date.now());
    expect(empty).toBeNull();
  });

  it('returns null when handed no records at all', async () => {
    expect(await computeMetDailyAggregated([], 0, DAY_MS, Date.now())).toBeNull();
  });

  /**
   * The aggregation trades a fixed cost — five round trips instead of one —
   * for one that does not grow with the day. On a full 1 Hz day that is a clear
   * win (measured 8.0s → 5.1s end-to-end, 2.6s of actual query time). On a
   * nearly-empty day it is SLOWER, because the round trips dominate.
   *
   * That is the correct trade: days grow to 86,400 rows and the rollup is
   * debounced, so a few hundred milliseconds on a sparse day costs nothing.
   * The assertion therefore only applies where the difference matters.
   */
  const SCALE_THRESHOLD = 20_000;

  it('is materially faster than loading the day into Node, at scale', async () => {
    if (!available) return;
    const nowMs = Date.now();

    const tAggStart = Date.now();
    await computeMetDailyAggregated(recordIds, dayStartMs, dayEndMs, nowMs);
    const aggMs = Date.now() - tAggStart;

    const tOldStart = Date.now();
    const rows = await MetMeasure.find({
      recordId: { $in: recordIds },
      rowType: 'data',
      timestampMs: { $gte: dayStartMs, $lt: dayEndMs },
    })
      .select(MET_FIELDS)
      .lean();
    computeMetDaily(rows as never, dayStartMs, dayEndMs, nowMs);
    const oldMs = Date.now() - tOldStart;

    console.log(`    rollup over ${rows.length.toLocaleString()} rows — original ${oldMs}ms, aggregated ${aggMs}ms`);

    if (rows.length < SCALE_THRESHOLD) {
      console.log(`    (below ${SCALE_THRESHOLD.toLocaleString()} rows — round-trip cost dominates, speed not asserted)`);
      return;
    }
    expect(aggMs).toBeLessThan(oldMs);
  });
});
