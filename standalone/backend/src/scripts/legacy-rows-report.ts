/**
 * READ-ONLY. What per-second (pre-minute) rows remain, by day and by source.
 *
 * `res: '1m'` marks a minute record. Anything without it predates the change —
 * but NOT everything without it is SFTP station data: mobile-app rows also carry
 * no `res`, and those are a different dataset with a different retention. The
 * breakdown below separates them so a deletion can never take the wrong one.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const db = mongoose.connection.db!;

  const total = await MetMeasure.countDocuments({});
  const minute = await MetMeasure.countDocuments({ res: '1m' });
  const legacy = await MetMeasure.countDocuments({ res: { $exists: false } });

  console.log(`total documents      : ${total.toLocaleString()}`);
  console.log(`minute records (1m)  : ${minute.toLocaleString()}`);
  console.log(`legacy per-second    : ${legacy.toLocaleString()}\n`);

  console.log('legacy rows BY SOURCE — only sftp rows are station data:');
  const bySource = await MetMeasure.aggregate([
    { $match: { res: { $exists: false } } },
    { $group: { _id: '$source', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  for (const s of bySource) console.log(`  ${String(s._id ?? 'null').padEnd(10)} ${s.n.toLocaleString()}`);

  console.log('\nlegacy SFTP rows by UTC day:');
  const byDay = await MetMeasure.aggregate<{ _id: string; n: number; mb: number }>([
    { $match: { res: { $exists: false }, source: 'sftp' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$timestampMs' } } },
        n: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  for (const d of byDay) console.log(`  ${d._id}  ${String(d.n).padStart(8)} rows`);
  console.log(`\ndays affected: ${byDay.length}`);

  // What the space actually is, so the benefit of deleting is a number.
  const stats = (await db.command({ collStats: 'metmeasures' })) as { count: number; size: number; totalIndexSize: number };
  const perDoc = (stats.size + stats.totalIndexSize) / stats.count;
  const legacySftp = byDay.reduce((a, d) => a + d.n, 0);
  console.log(`legacy sftp rows     : ${legacySftp.toLocaleString()}`);
  console.log(`approx space freed   : ${((legacySftp * perDoc) / 1024 / 1024).toFixed(0)} MB`);
  await mongoose.disconnect();
})();
