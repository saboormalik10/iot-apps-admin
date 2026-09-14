/**
 * READ-ONLY. Measures what the QC rules would reject on data already stored.
 *
 * The number that matters is the FALSE-positive rate: QC that flags real weather
 * is worse than no QC. Run this against live data before changing any limit.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';
import { applyQc } from '../ingest/qc';
import type { ParsedMetRow } from '../ingest/met-csv/parse-met-csv';

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const since = Date.now() - 3 * 86_400_000;
  // Scoped to one organisation and sorted the way `{organizationId, timestampMs:-1}`
  // is ordered: an unscoped sort blows the 100 MB in-memory sort limit on M0.
  const org = await MetMeasure.findOne({ rowType: 'data' }).select('organizationId').sort({ timestampMs: -1 }).lean();
  const rows = (
    await MetMeasure.find({ organizationId: org!.organizationId, timestampMs: { $gte: since }, rowType: 'data' })
      .sort({ timestampMs: -1 })
      .limit(200_000)
      .lean()
  ).reverse();
  console.log(`sampled ${rows.length} stored readings from the last 3 days`);
  if (rows.length === 0) return mongoose.disconnect();

  const asParsed = rows.map((r) => ({
    timestampMs: r.timestampMs,
    raw: r.dataSentence,
    windSpeedMs: r.windSpeedMs ?? null,
    windSpeedKmh: r.windSpeedKmh ?? null,
    windSpeedKnots: r.windSpeedKnots ?? null,
    windDirRelDeg: r.windDirRelDeg ?? null,
    tempC: r.tempC ?? null,
    humidityPct: r.humidityPct ?? null,
    pressureHpa: r.pressureHpa ?? null,
    dewPointC: r.dewPointC ?? null,
    solarWm2: r.solarWm2 ?? null,
    precipMm: r.precipMm ?? null,
    voltageV: r.voltageV ?? null,
    gpsLat: r.gpsLat ?? null,
    gpsLng: r.gpsLng ?? null,
    // Not stored today, so this run cannot exercise the status check.
    status: null,
  })) as ParsedMetRow[];

  const out = applyQc(asParsed);
  console.log(`flagged rows: ${out.flaggedRows} (${((out.flaggedRows / rows.length) * 100).toFixed(3)}%)`);
  console.log('by code:', out.counts);

  // Compare each flagged reading against the PREVIOUS reading of the same field
  // — which is what the step check actually uses. The adjacent rows in the
  // collection are 1 Hz wind rows carrying no pressure at all.
  let prevP: { ts: number; v: number } | null = null;
  out.rows.forEach((r, i) => {
    const src = asParsed[i];
    if (r.qc?.some((c) => c === 'step:pressureHpa') && prevP) {
      const dtMin = (src.timestampMs - prevP.ts) / 60_000;
      const d = (src.pressureHpa as number) - prevP.v;
      console.log(
        `step:pressureHpa  ${new Date(prevP.ts).toISOString()} ${prevP.v} -> ` +
          `${new Date(src.timestampMs).toISOString()} ${src.pressureHpa}  ` +
          `= ${d.toFixed(2)} hPa in ${dtMin.toFixed(2)} min (${(d / dtMin).toFixed(2)} hPa/min)`,
      );
    }
    if (src.pressureHpa !== null) prevP = { ts: src.timestampMs, v: src.pressureHpa };
  });
  await mongoose.disconnect();
})();
