/** READ-ONLY. The observed minute-to-minute change distribution, per field. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const since = Date.now() - 7 * 86_400_000;
  const org = await MetMeasure.findOne({ rowType: 'data' }).select('organizationId').sort({ timestampMs: -1 }).lean();
  const rows = (
    await MetMeasure.find({ organizationId: org!.organizationId, timestampMs: { $gte: since }, rowType: 'data' })
      .select('timestampMs pressureHpa tempC humidityPct windSpeedMs')
      .sort({ timestampMs: -1 })
      .limit(400_000)
      .lean()
  ).reverse();

  for (const field of ['pressureHpa', 'tempC', 'humidityPct', 'windSpeedMs'] as const) {
    let prev: { ts: number; v: number } | null = null;
    const rates: number[] = [];
    for (const r of rows) {
      const v = r[field];
      if (v === null || v === undefined) continue;
      if (prev) {
        const dtMin = (r.timestampMs - prev.ts) / 60_000;
        // Only adjacent readings; a gap is not a step.
        if (dtMin > 0 && dtMin <= 5) rates.push(Math.abs(v - prev.v) / dtMin);
      }
      prev = { ts: r.timestampMs, v };
    }
    rates.sort((a, b) => a - b);
    console.log(
      `${field}: n=${rates.length}  p50=${pct(rates, 50).toFixed(3)}  p99=${pct(rates, 99).toFixed(3)}  ` +
        `p99.9=${pct(rates, 99.9).toFixed(3)}  p99.99=${pct(rates, 99.99).toFixed(3)}  max=${rates[rates.length - 1].toFixed(3)}  (per min)`,
    );
  }
  await mongoose.disconnect();
})();
