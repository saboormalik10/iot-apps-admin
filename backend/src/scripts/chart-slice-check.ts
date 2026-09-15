/** READ-ONLY. What the record chart actually receives for today's record. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';
import { MetRecord } from '../models/MetRecord';

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const rec = await MetRecord.findOne({}).sort({ dateStartMs: -1 }).select('_id dayKey').lean();
  const q = { recordId: rec!._id, rowType: 'data' as const };
  const total = await MetMeasure.countDocuments(q);

  // Exactly what the chart fetches: first VIZ_LIMIT rows by time.
  const slice = await MetMeasure.find(q).sort({ timestampMs: 1 }).limit(2000)
    .select('timestampMs tempC humidityPct pressureHpa dewPointC windSpeedMs res').lean();

  const n = (f: string) => slice.filter((r) => (r as Record<string, unknown>)[f] != null).length;
  console.log(`record ${rec!.dayKey}: ${total} rows total\n`);
  console.log(`first 2000 rows span : ${new Date(slice[0].timestampMs).toISOString().slice(11,19)} → ${new Date(slice[slice.length-1].timestampMs).toISOString().slice(11,19)}`);
  console.log(`  windSpeedMs : ${n('windSpeedMs')}`);
  console.log(`  tempC       : ${n('tempC')}`);
  console.log(`  humidityPct : ${n('humidityPct')}`);
  console.log(`  pressureHpa : ${n('pressureHpa')}`);
  console.log(`  dewPointC   : ${n('dewPointC')}`);
  console.log(`  minute rows : ${slice.filter((r) => r.res === '1m').length}`);

  const whole = await MetMeasure.countDocuments({ ...q, tempC: { $ne: null } });
  console.log(`\ntempC across the WHOLE record: ${whole}`);
  await mongoose.disconnect();
})();
