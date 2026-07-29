import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Device bleId uniqueness: (organizationId, bleId) → (organizationId, bleId, type).
 *
 * Both mobile apps register the shared demo device as `bleId: 'demo'`, separated
 * by `type`. The old two-field unique index makes the second app's registration
 * collide, and Mongoose creates indexes but NEVER drops the superseded one — so
 * without this migration the new index is added alongside the old one and the
 * old one still rejects the write.
 *
 *   npm run migrate:device-bleid-index
 *
 * Safe to re-run. Refuses to drop anything if the data would violate the new
 * key, so a genuine duplicate is reported instead of silently failing later.
 */

const OLD_INDEX = 'organizationId_1_bleId_1';
const NEW_INDEX = 'organizationId_1_bleId_1_type_1';

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const col = mongoose.connection.collection('devices');

  const before = await col.indexes();
  console.log('Indexes before:', before.map((i) => i.name).join(', '));

  // Guard: the new key must already hold, or creating it unique will fail.
  const dupes = await col
    .aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: { o: '$organizationId', b: '$bleId', t: '$type' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  if (dupes.length) {
    console.error(`❌ ${dupes.length} duplicate (organizationId, bleId, type) group(s) — resolve these first:`);
    for (const d of dupes) console.error('   ', JSON.stringify(d._id), `×${d.n}`);
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  if (before.some((i) => i.name === OLD_INDEX)) {
    await col.dropIndex(OLD_INDEX);
    console.log(`✅ dropped ${OLD_INDEX}`);
  } else {
    console.log(`• ${OLD_INDEX} already absent`);
  }

  if (!before.some((i) => i.name === NEW_INDEX)) {
    await col.createIndex({ organizationId: 1, bleId: 1, type: 1 }, { unique: true, name: NEW_INDEX });
    console.log(`✅ created ${NEW_INDEX}`);
  } else {
    console.log(`• ${NEW_INDEX} already present`);
  }

  const after = await col.indexes();
  console.log('Indexes after: ', after.map((i) => i.name).join(', '));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
