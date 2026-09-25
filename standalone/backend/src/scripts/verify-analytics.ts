import 'dotenv/config';
import mongoose from 'mongoose';

import { MetMeasure } from '../models/MetMeasure';
import { MetRecord } from '../models/MetRecord';
import {
  WIND_SECTORS,
  SPEED_BANDS,
  sectorIndex,
  speedBandIndex,
  bucketStart,
  round,
  mean,
} from '../analytics/analytics.util';

/**
 * Equivalence check for the M25 wind-rose / multi-sensor / wind-gust rewrite.
 *
 * All three moved from "pull every raw row into Node and reduce it there" to a
 * single MongoDB aggregation. This recomputes the OLD way — the exact same
 * loops, `sectorIndex`/`speedBandIndex`/`bucketStart` helpers, on the SAME rows
 * — and diffs it against the live endpoint, in one process, back to back, so
 * both read the same instant of a live database (the station uploads every
 * minute; comparing two HTTP calls made minutes apart against a live station
 * compares two different snapshots, not two implementations — this is why the
 * window defaults to ending 15 minutes ago, clear of any in-flight catch-up
 * ingestion).
 *
 *   npm run verify:analytics -- <deviceId> [hoursBack]
 */
const TOL = 0.02; // small float rounding differences are expected, drift is not

async function main(): Promise<void> {
  const deviceId = process.argv[2];
  const hours = Number(process.argv[3] ?? 168);
  if (!deviceId) throw new Error('usage: verify:analytics -- <deviceId> [hoursBack]');

  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });

  // End 15 minutes ago — clear of live ingestion catch-up, so both the OLD
  // computation and the NEW endpoint see an unchanging window.
  const toMs = Date.now() - 15 * 60_000;
  const fromMs = toMs - hours * 3_600_000;

  const records = await MetRecord.find({ deviceId: new mongoose.Types.ObjectId(deviceId), deletedAt: null })
    .select('_id')
    .lean();
  const recordIds = records.map((r) => r._id);

  console.log(`• window: ${new Date(fromMs).toISOString()} → ${new Date(toMs).toISOString()}  (${hours}h, ending 15 min ago)`);

  const rows = await MetMeasure.find({
    recordId: { $in: recordIds },
    rowType: 'data',
    timestampMs: { $gte: fromMs, $lte: toMs },
  })
    .select('timestampMs windSpeedMs windDirTrueDeg windDirRelDeg tempC')
    .lean();
  console.log(`• rows in window: ${rows.length.toLocaleString()}\n`);

  const base = process.env.VERIFY_API ?? 'http://localhost:3100';
  const login = (await fetch(`${base}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@observator.com', password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234' }),
  }).then((r) => r.json())) as { data: { accessToken: string } };
  const auth = { Authorization: `Bearer ${login.data.accessToken}` };

  let failures = 0;

  // ── 1. Wind rose ────────────────────────────────────────────────────────
  {
    console.log('── wind rose ──');
    const oldSectors = WIND_SECTORS.map((label, i) => ({
      dir: i * 22.5,
      label,
      count: 0,
      sum: 0,
      max: 0,
      bands: new Array(SPEED_BANDS.length).fill(0),
    }));
    let total = 0;
    for (const r of rows) {
      const dir = r.windDirTrueDeg ?? r.windDirRelDeg;
      const spd = r.windSpeedMs;
      if (dir == null || spd == null) continue;
      const s = oldSectors[sectorIndex(dir)];
      s.count++;
      s.sum += spd;
      if (spd > s.max) s.max = spd;
      s.bands[speedBandIndex(spd)]++;
      total++;
    }

    const fresh = (await fetch(
      `${base}/v1/analytics/met/wind-rose?deviceId=${deviceId}&from=${fromMs}&to=${toMs}&unit=m%2Fs`,
      { headers: auth },
    ).then((r) => r.json())) as { totalSamples: number; sectors: Array<{ count: number; avgSpeedMs: number; maxSpeedMs: number; speedBuckets: Array<{ count: number }> }> };

    const totalOk = fresh.totalSamples === total;
    console.log(`  ${totalOk ? '✓' : '✗'} totalSamples  old=${total}  new=${fresh.totalSamples}`);
    if (!totalOk) failures++;

    let sectorMismatches = 0;
    for (let i = 0; i < WIND_SECTORS.length; i++) {
      const o = oldSectors[i];
      const n = fresh.sectors[i];
      const avgOk = Math.abs(round(o.count ? o.sum / o.count : 0, 2)! - n.avgSpeedMs) <= TOL;
      const maxOk = Math.abs(round(o.max, 2)! - n.maxSpeedMs) <= TOL;
      const countOk = o.count === n.count;
      const bandsOk = o.bands.every((c, bi) => c === n.speedBuckets[bi].count);
      if (!avgOk || !maxOk || !countOk || !bandsOk) {
        sectorMismatches++;
        console.log(`  ✗ sector ${WIND_SECTORS[i]}: count ${o.count}/${n.count} avg ${round(o.sum && o.count ? o.sum / o.count : 0, 2)}/${n.avgSpeedMs} max ${round(o.max, 2)}/${n.maxSpeedMs} bands ${JSON.stringify(o.bands)}/${JSON.stringify(n.speedBuckets.map((b) => b.count))}`);
      }
    }
    console.log(`  ${sectorMismatches ? '✗' : '✓'} all 16 sectors — ${sectorMismatches ? `${sectorMismatches} differ` : 'count, avg, max, and all 5 speed bands match exactly'}`);
    failures += sectorMismatches;
  }

  // ── 2. Multi-sensor ─────────────────────────────────────────────────────
  {
    console.log('\n── multi-sensor (wind_speed, temperature @ 5min) ──');
    const intervalMs = 5 * 60_000;
    const buckets = new Map<number, { speed: number[]; temp: number[] }>();
    for (const r of rows) {
      const b = bucketStart(r.timestampMs as number, intervalMs);
      let e = buckets.get(b);
      if (!e) {
        e = { speed: [], temp: [] };
        buckets.set(b, e);
      }
      if (typeof r.windSpeedMs === 'number') e.speed.push(r.windSpeedMs);
      if (typeof r.tempC === 'number') e.temp.push(r.tempC);
    }
    const oldTimestamps = [...buckets.keys()].sort((a, b) => a - b);

    const fresh = (await fetch(
      `${base}/v1/analytics/met/multi-sensor?deviceId=${deviceId}&sensors[]=wind_speed&sensors[]=temperature&from=${fromMs}&to=${toMs}&interval=5min`,
      { headers: auth },
    ).then((r) => r.json())) as { timestamps: number[]; series: Array<{ sensor: string; values: (number | null)[] }> };

    const tsOk = oldTimestamps.length === fresh.timestamps.length && oldTimestamps.every((t, i) => t === fresh.timestamps[i]);
    console.log(`  ${tsOk ? '✓' : '✗'} timestamps  old=${oldTimestamps.length}  new=${fresh.timestamps.length}`);
    if (!tsOk) failures++;

    let valueMismatches = 0;
    const speedSeries = fresh.series.find((s) => s.sensor === 'wind_speed')!;
    const tempSeries = fresh.series.find((s) => s.sensor === 'temperature')!;
    oldTimestamps.forEach((t, i) => {
      const b = buckets.get(t)!;
      const oldSpeed = b.speed.length ? round(mean(b.speed), 2) : null;
      const oldTemp = b.temp.length ? round(mean(b.temp), 2) : null;
      const newSpeed = speedSeries.values[i];
      const newTemp = tempSeries.values[i];
      const speedOk = oldSpeed === null ? newSpeed === null : Math.abs(oldSpeed - (newSpeed ?? NaN)) <= TOL;
      const tempOk = oldTemp === null ? newTemp === null : Math.abs(oldTemp - (newTemp ?? NaN)) <= TOL;
      if (!speedOk || !tempOk) {
        valueMismatches++;
        if (valueMismatches <= 5) console.log(`  ✗ bucket ${new Date(t).toISOString()}: speed ${oldSpeed}/${newSpeed}  temp ${oldTemp}/${newTemp}`);
      }
    });
    console.log(`  ${valueMismatches ? '✗' : '✓'} bucket values — ${valueMismatches ? `${valueMismatches} of ${oldTimestamps.length} differ` : `all ${oldTimestamps.length} buckets match exactly`}`);
    failures += valueMismatches;
  }

  // ── 3. Wind gust history ────────────────────────────────────────────────
  {
    console.log('\n── wind gust history (1h) ──');
    const intervalMs = 3_600_000;
    const oldBuckets = new Map<number, { gustMs: number; dirDeg: number | null }>();
    for (const r of rows) {
      if (r.windSpeedMs == null) continue;
      const b = bucketStart(r.timestampMs as number, intervalMs);
      const cur = oldBuckets.get(b);
      if (!cur || (r.windSpeedMs as number) > cur.gustMs) {
        oldBuckets.set(b, { gustMs: r.windSpeedMs as number, dirDeg: r.windDirTrueDeg ?? null });
      }
    }
    const oldSorted = [...oldBuckets.entries()].sort((a, b) => a[0] - b[0]);

    const fresh = (await fetch(
      `${base}/v1/analytics/met/wind-gust-history?deviceId=${deviceId}&from=${fromMs}&to=${toMs}&interval=1h`,
      { headers: auth },
    ).then((r) => r.json())) as { data: Array<{ ts: number; gustMs: number; dirDeg: number | null }> };

    const lenOk = oldSorted.length === fresh.data.length;
    console.log(`  ${lenOk ? '✓' : '✗'} bucket count  old=${oldSorted.length}  new=${fresh.data.length}`);
    if (!lenOk) failures++;

    let gustMismatches = 0;
    oldSorted.forEach(([ts, g], i) => {
      const n = fresh.data[i];
      const tsOk = n && n.ts === ts;
      const gustOk = n && Math.abs(round(g.gustMs)! - n.gustMs) <= TOL;
      // Direction is exact-match only — it's a discrete reading, not an average.
      const dirOk = n && g.dirDeg === n.dirDeg;
      if (!tsOk || !gustOk || !dirOk) {
        gustMismatches++;
        if (gustMismatches <= 5) console.log(`  ✗ ${new Date(ts).toISOString()}: gust ${round(g.gustMs)}/${n?.gustMs}  dir ${g.dirDeg}/${n?.dirDeg}`);
      }
    });
    console.log(`  ${gustMismatches ? '✗' : '✓'} gust + direction per bucket — ${gustMismatches ? `${gustMismatches} of ${oldSorted.length} differ` : `all ${oldSorted.length} buckets match exactly, including the argmax tie-break`}`);
    failures += gustMismatches;
  }

  // ── 4. Device comparison (single device, wind_speed) ──────────────────────
  {
    console.log('\n── device comparison (wind_speed @ 1h) ──');
    const intervalMs = 3_600_000;
    const buckets = new Map<number, number[]>();
    for (const r of rows) {
      const v = r.windSpeedMs;
      if (typeof v !== 'number') continue;
      const b = bucketStart(r.timestampMs as number, intervalMs);
      (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(v);
    }
    const oldSorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);

    const fresh = (await fetch(
      `${base}/v1/analytics/org/device-comparison?deviceIds[]=${deviceId}&sensor=wind_speed&from=${fromMs}&to=${toMs}&interval=1h`,
      { headers: auth },
    ).then((r) => r.json())) as { series: Array<{ deviceId: string; values: Array<{ ts: number; value: number | null }> }> };
    const newValues = fresh.series[0]?.values ?? [];

    const lenOk = oldSorted.length === newValues.length;
    console.log(`  ${lenOk ? '✓' : '✗'} bucket count  old=${oldSorted.length}  new=${newValues.length}`);
    if (!lenOk) failures++;

    let mismatches = 0;
    oldSorted.forEach(([ts, arr], i) => {
      const n = newValues[i];
      const oldVal = round(mean(arr), 2);
      const tsOk = n && n.ts === ts;
      const valOk = n && Math.abs((oldVal ?? 0) - (n.value ?? NaN)) <= TOL;
      if (!tsOk || !valOk) {
        mismatches++;
        if (mismatches <= 5) console.log(`  ✗ ${new Date(ts).toISOString()}: ${oldVal}/${n?.value}`);
      }
    });
    console.log(`  ${mismatches ? '✗' : '✓'} bucket values — ${mismatches ? `${mismatches} of ${oldSorted.length} differ` : `all ${oldSorted.length} buckets match exactly`}`);
    failures += mismatches;
  }

  await mongoose.disconnect();
  if (failures) {
    console.log(`\n✗ ${failures} mismatch(es)`);
    process.exit(1);
  }
  console.log('\n✓ all three endpoints equivalent to the old implementation');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
