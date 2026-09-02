import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Apply the retention windows to the LIVE indexes.
 *
 * Changing `expireAfterSeconds` in a Mongoose schema does nothing on its own:
 * the index already exists, so Mongoose leaves it alone and the old window stays
 * in force. `collMod` is the only way to change it in place — dropping and
 * recreating would leave the collection without a TTL while a large index
 * rebuilt, which on the readings collection is exactly when you want it least.
 *
 * Windows are staggered on purpose:
 *   measures 15d  <  records 18d  <  ingest ledger 23d
 * A record must outlive its measures so a day is never orphaned mid-cleanup, and
 * the ledger must outlive both — it is the fingerprint list that stops a file
 * being ingested twice, so if it expired first a file replayed from the
 * permanent archive would resurrect readings that had just been removed.
 *
 *   npm run migrate:ttl -- --dry-run
 *   npm run migrate:ttl
 */
const TARGETS: { collection: string; index: string; days: number }[] = [
  { collection: 'metmeasures', index: 'sftp_ttl_createdAt', days: 15 },
  { collection: 'metrecords', index: 'sftp_ttl_createdAt', days: 18 },
  { collection: 'metingestfiles', index: 'receivedAt_1', days: 23 },
];

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });
  const db = mongoose.connection.db!;

  for (const t of TARGETS) {
    const ix = ((await db.collection(t.collection).indexes()) as any[]).find((i) => i.name === t.index);
    if (!ix) {
      console.log(`  ${t.collection}: index ${t.index} not found — skipped`);
      continue;
    }
    const wasDays = (ix.expireAfterSeconds ?? 0) / 86400;
    const want = t.days * 86400;
    if (ix.expireAfterSeconds === want) {
      console.log(`  ${t.collection.padEnd(18)} already ${t.days} days`);
      continue;
    }
    console.log(`  ${t.collection.padEnd(18)} ${wasDays.toFixed(0)} → ${t.days} days`);
    if (dryRun) continue;
    await db.command({
      collMod: t.collection,
      index: { name: t.index, expireAfterSeconds: want },
    });
  }

  // How much would go on the next sweep, so the change is never a surprise.
  const cutoff = new Date(Date.now() - 15 * 86400_000);
  const due = await db.collection('metmeasures').countDocuments({ source: 'sftp', createdAt: { $lt: cutoff } });
  console.log(`\n  readings now past the 15-day window: ${due.toLocaleString()}`);
  if (dryRun) console.log('  DRY RUN — nothing was changed.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
