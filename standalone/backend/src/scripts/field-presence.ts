/** READ-ONLY. Which measure fields actually carry data, over the last 7 days. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';

const FIELDS = [
  'tempC','humidityPct','pressureHpa','windSpeedMs','windGustMs','windSpeedMean2mMs','windSpeedMean10mMs',
  'windSpeedTrueMs','windSpeedRelMs','windDirTrueDeg','windDirRelDeg','dewPointC','precipMm','precipRateMmHr',
  'solarWm2','qnhHpa','qfeHpa','gpsAltM','gpsLat','gpsLng','gpsSatellites','gpsHorDilution','gpsQuality',
  'voltageV','batteryVoltageV','currentA',
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const since = Date.now() - 7 * 86_400_000;
  const match = { rowType: 'data' as const, timestampMs: { $gte: since } };
  const total = await MetMeasure.countDocuments(match);
  console.log(`rows in window: ${total}\n`);
  const group = { _id: null } as Record<string, unknown>;
  for (const f of FIELDS) group[f] = { $sum: { $cond: [{ $ne: [{ $ifNull: [`$${f}`, null] }, null] }, 1, 0] } };
  const [r] = await MetMeasure.aggregate([{ $match: match }, { $group: group as never }]);
  const have: string[] = [];
  const empty: string[] = [];
  for (const f of FIELDS) {
    const n = (r?.[f] as number) ?? 0;
    (n > 0 ? have : empty).push(`${f} (${n})`);
  }
  console.log('HAS DATA:'); have.forEach((x) => console.log('  ' + x));
  console.log('\nEMPTY:'); empty.forEach((x) => console.log('  ' + x));
  await mongoose.disconnect();
})();
