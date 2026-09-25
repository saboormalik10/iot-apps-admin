/**
 * Load test: does the daily rollup stay FLAT as a day fills?
 *
 * This is the regression that matters most in the plan. Before M14 W2 the
 * summary re-read the whole day on every `MET_MEASURES` event — at 1,440 events
 * a day that is ~62M document reads per station per day, and the cost per
 * recompute grows linearly with how full the day already is. The fix was a
 * MongoDB-side `$group` plus a per-(device, day) debounce.
 *
 * A functional test cannot catch that regression: the summary is still CORRECT
 * when it is slow. Only the SHAPE of the curve shows it, so this measures
 * recompute time at increasing fill levels and reports the growth factor.
 *
 *   npx ts-node src/scripts/load-test-rollup.ts [--rows 86400] [--keep]
 *
 * Writes into a scratch device and removes it afterwards unless `--keep`.
 */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { MetMeasure } from '../models/MetMeasure';
import { MetRecord } from '../models/MetRecord';
import { Device } from '../models/Device';
import { Organization } from '../models/Organization';
import { computeMetDailyAggregated } from '../analytics/daily-summary-agg';

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) || fallback : fallback;
};

/** A full day at 1 Hz. The number the system is actually specified for. */
const ROWS = arg('rows', 86_400);
const KEEP = process.argv.includes('--keep');
const BATCH = 5_000;
/** Fill levels to measure at, as a fraction of the day. */
const CHECKPOINTS = [0.1, 0.25, 0.5, 0.75, 1.0];
/** Repeats per checkpoint; the median is reported, so one slow call cannot skew it. */
const SAMPLES = 5;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  const org = await Organization.findOne({ deletedAt: null }).lean();
  if (!org) throw new Error('No organisation to attach the scratch station to');

  const device = await Device.create({
    organizationId: org._id, name: 'LOADTEST scratch', type: 'MET-LINK', bleId: `loadtest-${Date.now()}`,
  });

  // A whole local day, so the aggregation's time window is the real one.
  const dayStartMs = new Date().setUTCHours(0, 0, 0, 0);
  const dayEndMs = dayStartMs + 86_400_000;

  const record = await MetRecord.create({
    organizationId: org._id, deviceId: device._id, deviceName: 'LOADTEST scratch',
    dateStart: new Date(dayStartMs).toISOString(), dateStartMs: dayStartMs, dateEndMs: dayStartMs,
    measureCount: 0, source: 'sftp', dayKey: `loadtest-${Date.now()}`,
  });
  const recordIds = [record._id as Types.ObjectId];

  console.log(`• filling a day with ${ROWS.toLocaleString()} readings, timing the rollup as it grows\n`);
  console.log('  rows in day    rollup (median of 5)   per-1k-rows');
  console.log('  ───────────    ────────────────────   ───────────');

  const results: Array<{ rows: number; ms: number }> = [];
  let written = 0;

  for (const fraction of CHECKPOINTS) {
    const target = Math.floor(ROWS * fraction);

    while (written < target) {
      const n = Math.min(BATCH, target - written);
      await MetMeasure.insertMany(
        Array.from({ length: n }, (_, i) => {
          const ts = dayStartMs + (written + i) * 1000;
          return {
            recordId: record._id, organizationId: org._id, deviceId: device._id,
            rowType: 'data', timestampMs: ts, timestamp: new Date(ts).toISOString(),
            dataSentence: `${new Date(ts).toISOString()},${350 - (i % 360)},0.${50 + (i % 40)},K,A`,
            // Realistic spread so min/max/percentile work is not trivially cheap.
            windSpeedMs: 0.1 + ((written + i) % 300) / 20,
            windSpeedKmh: 0.36 + ((written + i) % 300) / 5.5,
            windDirRelDeg: (written + i) % 360,
            windDirTrueDeg: (written + i) % 360,
            source: 'sftp',
          };
        }),
        { ordered: false },
      );
      written += n;
    }

    await MetRecord.updateOne({ _id: record._id }, { $set: { measureCount: written, dateEndMs: dayStartMs + written * 1000 } });

    const timings: number[] = [];
    for (let s = 0; s < SAMPLES; s += 1) {
      const t0 = process.hrtime.bigint();
      await computeMetDailyAggregated(recordIds, dayStartMs, dayEndMs, Date.now());
      timings.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }

    const ms = median(timings);
    results.push({ rows: written, ms });
    console.log(
      `  ${written.toLocaleString().padStart(11)}    ${ms.toFixed(0).padStart(15)} ms   ${((ms / written) * 1000).toFixed(2).padStart(8)} ms`,
    );
  }

  // The verdict. Linear cost would grow ~10× from 10% to 100% of a day.
  const first = results[0];
  const last = results[results.length - 1];
  const rowGrowth = last.rows / first.rows;
  const timeGrowth = last.ms / first.ms;

  console.log(`\n  rows grew ${rowGrowth.toFixed(1)}×, rollup time grew ${timeGrowth.toFixed(1)}×`);
  if (timeGrowth > rowGrowth * 0.6) {
    console.log('  ❌ LINEAR — the rollup is re-reading the day. This is the M14 regression.');
  } else if (timeGrowth > 2) {
    console.log('  ⚠️  sub-linear but rising — worth watching as stations are added');
  } else {
    console.log('  ✅ FLAT — cost is dominated by the aggregation, not by how full the day is');
  }

  if (!KEEP) {
    await MetMeasure.deleteMany({ recordId: record._id });
    await MetRecord.deleteOne({ _id: record._id });
    await Device.deleteOne({ _id: device._id });
    console.log('\n  scratch removed');
  } else {
    console.log(`\n  --keep: left device ${device._id} in place`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
