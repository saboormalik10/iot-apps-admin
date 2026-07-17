/**
 * Migration: replace the unique+SPARSE index on {organizationId, localRecordId}
 * with a unique+PARTIAL one (§Month 12).
 *
 * Why: `sparse` only skips documents where the field is ABSENT. `localRecordId`
 * is declared `default: null`, so every record without a device-assigned id was
 * written with an explicit null and therefore INCLUDED in the unique index. Only
 * one such record could exist per organization — so the first CSV import worked
 * and every one after it failed with `E11000 duplicate key … localRecordId: null`.
 * The same trap applied to any sync/record-create without a localRecordId.
 *
 * The partial index applies uniqueness only where localRecordId is a real number,
 * which is what the constraint was always for. Nulls become unconstrained.
 *
 * Mongo cannot change an existing index's options in place (IndexOptionsConflict),
 * so this drops and recreates. Idempotent — safe to re-run; it verifies the
 * current shape first and exits early when already migrated.
 *
 * Run: npx ts-node src/scripts/migrate-metrecord-index.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const INDEX_NAME = 'organizationId_1_localRecordId_1';

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle');
  const col = db.collection('metrecords');

  const indexes = await col.indexes();
  const current = indexes.find((i) => i.name === INDEX_NAME);

  if (!current) {
    console.log(`• ${INDEX_NAME} not present — creating it fresh.`);
  } else if (current.partialFilterExpression) {
    console.log(`✓ Already migrated (${INDEX_NAME} is partial). Nothing to do.`);
    await mongoose.disconnect();
    return;
  } else {
    console.log(`• Found the old index: ${JSON.stringify({ unique: current.unique, sparse: current.sparse })}`);
  }

  // Safety: the new index still enforces uniqueness over real ids, so refuse to
  // proceed if the data already violates it rather than fail half-way through.
  const dupes = await col
    .aggregate([
      { $match: { localRecordId: { $type: 'number' } } },
      { $group: { _id: { org: '$organizationId', lrid: '$localRecordId' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();

  if (dupes.length) {
    console.error('✗ Refusing to migrate — duplicate (organizationId, localRecordId) pairs exist:');
    for (const d of dupes) console.error(`   ${JSON.stringify(d._id)} ×${d.n}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const before = {
    total: await col.countDocuments({}),
    nulls: await col.countDocuments({ localRecordId: null }),
    numeric: await col.countDocuments({ localRecordId: { $type: 'number' } }),
  };
  console.log(`• metrecords: ${before.total} total · ${before.nulls} null · ${before.numeric} numeric`);

  if (current) {
    await col.dropIndex(INDEX_NAME);
    console.log(`• Dropped ${INDEX_NAME}.`);
  }

  await col.createIndex(
    { organizationId: 1, localRecordId: 1 },
    { unique: true, partialFilterExpression: { localRecordId: { $type: 'number' } }, name: INDEX_NAME },
  );
  console.log(`✓ Recreated ${INDEX_NAME} as unique + partial ($type: 'number').`);

  const after = (await col.indexes()).find((i) => i.name === INDEX_NAME);
  console.log(`  now: ${JSON.stringify({ unique: after?.unique, partial: after?.partialFilterExpression })}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
