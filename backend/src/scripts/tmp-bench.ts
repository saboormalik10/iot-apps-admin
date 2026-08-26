import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';
import { MetRecord } from '../models/MetRecord';
import { DailySummaryService } from '../analytics/daily-summary.service';

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 20000 });
  const rec = await MetRecord.findOne({ dayKey: '2026-08-21' }).lean();
  if (!rec) throw new Error('need the 2026-08-21 record');

  const base = rec.dateStartMs;
  const existing = await MetMeasure.countDocuments({ recordId: rec._id });
  const target = 86_400;
  if (existing < target) {
    console.log(`  seeding ${target - existing} synthetic rows to reach a full 1 Hz day…`);
    const docs = [];
    for (let i = existing; i < target; i++) {
      docs.push({
        recordId: rec._id, organizationId: rec.organizationId, rowType: 'data',
        dataSentence: 'bench', timeStamp: new Date(base + i * 1000).toISOString(),
        timestampMs: base + i * 1000, source: 'sftp',
        windSpeedMs: 0.5 + (i % 100) / 100, windSpeedKmh: 1.8, windSpeedKnots: 1,
        windDirRelDeg: i % 360, windDirTrueDeg: i % 360,
        tempC: null, humidityPct: null, pressureHpa: null, dewPointC: null, solarWm2: null, precipMm: null,
      });
      if (docs.length === 10_000) { await MetMeasure.insertMany(docs, { ordered: false }); docs.length = 0; }
    }
    if (docs.length) await MetMeasure.insertMany(docs, { ordered: false });
  }
  const n = await MetMeasure.countDocuments({ recordId: rec._id });
  console.log(`  day size: ${n.toLocaleString()} rows\n`);

  const svc = new DailySummaryService();
  const runs: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await svc.populateMetDay(String(rec.organizationId), String(rec.deviceId), rec.dateStartMs, rec.dateStartMs + 86_400_000, '2026-08-21');
    runs.push(Date.now() - t0);
  }
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  console.log(`  populateMetDay: ${runs.map(r => r + 'ms').join(', ')}   avg ${avg.toFixed(0)}ms`);
  console.log(`\n  At 1,440 recomputes/day (one per agent POST):`);
  console.log(`    ${(avg * 1440 / 1000 / 60).toFixed(1)} minutes of CPU per station per day`);
  console.log(`    ${(n * 1440 / 1e6).toFixed(1)}M document reads per station per day`);
  await mongoose.disconnect();
}
main().catch(async e => { console.error(e); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
