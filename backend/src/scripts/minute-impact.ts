/** READ-ONLY. What the minute record changes, measured on live data. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';
import { aggregateToMinutes } from '../ingest/minute-aggregate';
import type { ParsedMetRow } from '../ingest/met-csv/parse-met-csv';

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const since = Date.now() - 2 * 86_400_000;
  const org = await MetMeasure.findOne({ rowType: 'data' }).select('organizationId').sort({ timestampMs: -1 }).lean();
  const rows = (
    await MetMeasure.find({ organizationId: org!.organizationId, timestampMs: { $gte: since }, rowType: 'data' })
      .sort({ timestampMs: -1 })
      .limit(200_000)
      .lean()
  ).reverse();

  const asParsed = rows.map((r) => ({
    timestampMs: r.timestampMs, raw: r.dataSentence,
    windSpeedMs: r.windSpeedMs ?? null, windSpeedKmh: null, windSpeedKnots: null,
    windDirRelDeg: r.windDirRelDeg ?? null, tempC: r.tempC ?? null,
    humidityPct: r.humidityPct ?? null, pressureHpa: r.pressureHpa ?? null,
    dewPointC: r.dewPointC ?? null, solarWm2: null, precipMm: null, voltageV: null,
    gpsLat: null, gpsLng: null, status: null,
  })) as ParsedMetRow[];

  const minutes = aggregateToMinutes(asParsed);
  const withWind = minutes.filter((m) => m.windSampleCount > 0);
  const gusts = withWind.filter((m) => m.windGustMs !== null);
  const ratios = gusts.map((m) => (m.windGustMs as number) / (m.windSpeedMs as number)).filter(Number.isFinite);

  console.log(`stored readings sampled : ${rows.length}`);
  console.log(`minute records          : ${minutes.length}`);
  console.log(`reduction               : ${(rows.length / minutes.length).toFixed(1)}x fewer rows`);
  console.log(`minutes carrying wind   : ${withWind.length}`);
  console.log(`median samples / minute : ${median(withWind.map((m) => m.windSampleCount))}`);
  console.log(`median gust / mean ratio: ${median(ratios).toFixed(2)}  (1.0 = steady, >1 = gusty)`);
  console.log(`max gust seen           : ${Math.max(...gusts.map((m) => m.windGustMs as number)).toFixed(2)} m/s`);
  console.log(`max 1-min mean seen     : ${Math.max(...withWind.map((m) => m.windSpeedMs ?? 0)).toFixed(2)} m/s`);
  await mongoose.disconnect();
})();

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
