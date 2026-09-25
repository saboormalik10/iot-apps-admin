/** READ-ONLY. Actual on-disk size of a MINUTE record, for capacity planning. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const db = mongoose.connection.db!;
  const stats = (await db.command({ collStats: 'metmeasures' })) as {
    count: number; size: number; totalIndexSize: number;
  };

  const minutes = await MetMeasure.find({ res: '1m' }).limit(200).lean();
  if (minutes.length === 0) { console.log('no minute records yet'); await mongoose.disconnect(); return; }

  // BSON size of the documents themselves.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bson = minutes.map((d) => require('bson').serialize(d).length);
  const avgBson = bson.reduce((a, b) => a + b, 0) / bson.length;

  // Index overhead measured across the whole collection, applied per document.
  const indexPerDoc = stats.totalIndexSize / stats.count;

  const perDoc = avgBson + indexPerDoc;
  console.log(`minute records sampled : ${minutes.length}`);
  console.log(`avg BSON document      : ${avgBson.toFixed(0)} bytes`);
  console.log(`index overhead per doc : ${indexPerDoc.toFixed(0)} bytes`);
  console.log(`TOTAL per minute record: ${perDoc.toFixed(0)} bytes\n`);

  const perStationDay = 1440 * perDoc;
  const perStationYear = perStationDay * 365;
  const GB = 1024 ** 3;
  console.log(`per station / day   : ${(perStationDay / 1024 / 1024).toFixed(2)} MB`);
  console.log(`per station / year  : ${(perStationYear / 1024 / 1024).toFixed(0)} MB`);
  console.log(`per station / 2 yrs : ${(2 * perStationYear / GB).toFixed(2)} GB\n`);
  for (const n of [1, 10, 20, 50, 100]) {
    console.log(`  ${String(n).padStart(3)} stations, 2 years: ${(n * 2 * perStationYear / GB).toFixed(1)} GB`);
  }
  await mongoose.disconnect();
})();
