/** READ-ONLY. Minute records by day, so a deletion decision has both sides. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const byDay = await MetMeasure.aggregate<{ _id: string; n: number; first: number; last: number }>([
    { $match: { res: '1m' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$timestampMs' } } },
        n: { $sum: 1 },
        first: { $min: '$timestampMs' },
        last: { $max: '$timestampMs' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  console.log('minute records by UTC day:');
  for (const d of byDay) {
    const t = (ms: number) => new Date(ms).toISOString().slice(11, 16);
    console.log(`  ${d._id}  ${String(d.n).padStart(5)} rows   ${t(d.first)} → ${t(d.last)}   (1440 = a full day)`);
  }
  console.log(`\ndays with minute records: ${byDay.length}`);
  console.log(`total minute records    : ${byDay.reduce((a, d) => a + d.n, 0).toLocaleString()}`);
  await mongoose.disconnect();
})();
