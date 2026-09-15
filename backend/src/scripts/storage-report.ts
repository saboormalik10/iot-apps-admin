/** READ-ONLY. Where the 512 MB is going, and what a retention change would cost. */
import 'dotenv/config';
import mongoose from 'mongoose';

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const db = mongoose.connection.db!;
  const stats = (await db.command({ dbStats: 1 })) as { dataSize: number; indexSize: number; storageSize: number };
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  console.log(`billed (data + index) : ${mb(stats.dataSize + stats.indexSize)} MB of 512 MB`);
  console.log(`  data                : ${mb(stats.dataSize)} MB`);
  console.log(`  indexes             : ${mb(stats.indexSize)} MB\n`);

  const cols = await db.listCollections().toArray();
  const rows: { name: string; docs: number; totalMb: number }[] = [];
  for (const c of cols) {
    const s = (await db.command({ collStats: c.name })) as { count: number; size: number; totalIndexSize: number };
    rows.push({ name: c.name, docs: s.count, totalMb: (s.size + s.totalIndexSize) / 1024 / 1024 });
  }
  rows.sort((a, b) => b.totalMb - a.totalMb);
  for (const r of rows.slice(0, 8)) {
    console.log(`  ${r.name.padEnd(26)} ${String(r.docs).padStart(10)} docs  ${r.totalMb.toFixed(1).padStart(7)} MB`);
  }

  // Per-document cost of a measure, and what a month of minute records implies.
  const m = (await db.command({ collStats: 'metmeasures' })) as { count: number; size: number; totalIndexSize: number };
  const perDoc = (m.size + m.totalIndexSize) / Math.max(m.count, 1);
  console.log(`\nper measure document  : ${perDoc.toFixed(0)} bytes (data + index)`);
  const perStationMonth = (1440 * 30 * perDoc) / 1024 / 1024;
  console.log(`1-minute records, 30 days, PER STATION: ${perStationMonth.toFixed(1)} MB`);
  console.log(`  → 10 stations: ${(perStationMonth * 10).toFixed(0)} MB   50 stations: ${(perStationMonth * 50).toFixed(0)} MB`);
  await mongoose.disconnect();
})();
