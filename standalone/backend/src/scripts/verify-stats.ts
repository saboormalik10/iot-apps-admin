import 'dotenv/config';
import mongoose from 'mongoose';

import { MetMeasure } from '../models/MetMeasure';
import { MetRecord } from '../models/MetRecord';
import { mean, stdDev, percentile, skewness, round, BEAUFORT, beaufortFromMs } from '../analytics/analytics.util';

/**
 * Equivalence check for the M25 statistics rewrite.
 *
 * `metStatistics` used to pull every raw value into Node and sort it. It now
 * computes everything in one aggregation. That is only a safe change if the two
 * produce the same numbers, so this recomputes the OLD way — the same helper
 * functions, on the same rows — and diffs them field by field.
 *
 * Percentiles are expected to differ slightly: the pipeline uses t-digest, which
 * is approximate by design. The tolerance below is what makes that explicit
 * rather than hidden.
 *
 *   npm run verify:stats -- <deviceId> <hoursBack>
 */
const TOLERANCE = { exact: 0.0001, percentile: 0.05 };

async function main(): Promise<void> {
  const deviceId = process.argv[2];
  const hours = Number(process.argv[3] ?? 24);
  if (!deviceId) throw new Error('usage: verify:stats -- <deviceId> [hoursBack]');

  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });

  const toMs = Date.now();
  const fromMs = toMs - hours * 3_600_000;
  const field = 'windSpeedMs';

  const records = await MetRecord.find({ deviceId: new mongoose.Types.ObjectId(deviceId), deletedAt: null })
    .select('_id')
    .lean();
  const recordIds = records.map((r) => r._id);

  console.log(`• window: last ${hours}h   device: ${deviceId}`);

  // ── OLD PATH: every value into Node, sorted ────────────────────────────────
  const t0 = Date.now();
  const rows = await MetMeasure.find({
    recordId: { $in: recordIds },
    rowType: 'data',
    timestampMs: { $gte: fromMs, $lte: toMs },
  })
    .select(`timestampMs ${field}`)
    .lean();
  const values = rows
    .map((r) => (r as Record<string, unknown>)[field])
    .filter((v): v is number => typeof v === 'number');
  const sorted = [...values].sort((a, b) => a - b);
  const mu = mean(values);
  const sd = stdDev(values, mu);
  const old = {
    count: values.length,
    mean: round(mu),
    median: round(percentile(sorted, 50)),
    stdDev: round(sd),
    variance: round(sd * sd),
    p10: round(percentile(sorted, 10)),
    p25: round(percentile(sorted, 25)),
    p50: round(percentile(sorted, 50)),
    p75: round(percentile(sorted, 75)),
    p90: round(percentile(sorted, 90)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    range: round(sorted[sorted.length - 1] - sorted[0]),
    skewness: round(skewness(values), 3),
  };
  const oldMs = Date.now() - t0;

  const oldBeaufort = new Array(BEAUFORT.length).fill(0);
  for (const v of values) oldBeaufort[beaufortFromMs(v).force]++;

  // ── NEW PATH: the running server's endpoint ────────────────────────────────
  const base = process.env.VERIFY_API ?? 'http://localhost:3100';
  const login = (await fetch(`${base}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' }),
  }).then((r) => r.json())) as { data: { accessToken: string } };

  const t1 = Date.now();
  const fresh = (await fetch(
    `${base}/v1/analytics/met/statistics?deviceId=${deviceId}&sensor=wind_speed&from=${fromMs}&to=${toMs}`,
    { headers: { Authorization: `Bearer ${login.data.accessToken}` } },
  ).then((r) => r.json())) as Record<string, unknown>;
  const newMs = Date.now() - t1;

  // ── Compare ────────────────────────────────────────────────────────────────
  console.log(`\n  old (values into Node): ${(oldMs / 1000).toFixed(2)}s`);
  console.log(`  new (one aggregation) : ${(newMs / 1000).toFixed(2)}s`);
  console.log(`  speed-up              : ${(oldMs / Math.max(newMs, 1)).toFixed(1)}×\n`);

  let failures = 0;
  for (const [k, oldVal] of Object.entries(old)) {
    const newVal = fresh[k] as number | null;
    const tol = k.startsWith('p') || k === 'median' ? TOLERANCE.percentile : TOLERANCE.exact;
    const diff = Math.abs((oldVal ?? 0) - (newVal ?? 0));
    const ok = diff <= tol;
    if (!ok) failures++;
    console.log(
      `  ${ok ? '✓' : '✗'} ${k.padEnd(10)} old=${String(oldVal).padStart(10)}  new=${String(newVal).padStart(10)}` +
        (diff > 0 ? `  Δ=${diff.toFixed(4)}` : ''),
    );
  }

  const newBeaufort = (fresh.beaufortBreakdown ?? []) as Array<{ force: number; count: number }>;
  let bfMismatch = 0;
  for (const b of newBeaufort) {
    if (b.count !== oldBeaufort[b.force]) {
      bfMismatch++;
      console.log(`  ✗ beaufort force ${b.force}: old=${oldBeaufort[b.force]} new=${b.count}`);
    }
  }
  console.log(`  ${bfMismatch ? '✗' : '✓'} beaufortBreakdown — ${bfMismatch ? `${bfMismatch} band(s) differ` : 'all 13 bands match exactly'}`);

  await mongoose.disconnect();
  if (failures || bfMismatch) {
    console.log(`\n✗ ${failures + bfMismatch} field(s) outside tolerance`);
    process.exit(1);
  }
  console.log('\n✓ equivalent');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
