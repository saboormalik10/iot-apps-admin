/**
 * Re-key StationAccount from `account` to `(account, folderPath)`.
 *
 * The client confirmed (25 Aug) that routing is by folder — `/upload/<Customer>/
 * <Tower>/` — so one customer account now serves many towers. The old unique
 * index on `account` alone forbids exactly that.
 *
 * Existing rows get `folderPath: ''`, which is the flat legacy layout, so an
 * agent that has not been reconfigured keeps working unchanged.
 *
 *   npx ts-node src/scripts/migrate-station-folders.ts [--apply]
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { StationAccount } from '../models/StationAccount';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 15_000 });
  console.log(`• ${mongoose.connection.name}  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const coll = mongoose.connection.db!.collection('stationaccounts');

  // ── 1. Backfill folderPath ────────────────────────────────────────────────
  const missing = await coll.countDocuments({ folderPath: { $exists: false } });
  console.log(`  rows without folderPath: ${missing}`);
  if (APPLY && missing > 0) {
    const res = await coll.updateMany({ folderPath: { $exists: false } }, { $set: { folderPath: '' } });
    console.log(`  ✅ backfilled ${res.modifiedCount}`);
  }

  // ── 2. Swap the unique index ──────────────────────────────────────────────
  const indexes = await coll.indexes();
  const oldIdx = indexes.find((i) => i.name === 'account_1' && i.unique);
  const newIdx = indexes.find((i) => i.name === 'account_1_folderPath_1');

  console.log(`  unique index on account alone: ${oldIdx ? 'present — must go' : 'absent'}`);
  console.log(`  compound (account, folderPath): ${newIdx ? 'present' : 'missing'}`);

  if (APPLY) {
    if (!newIdx) {
      // Created BEFORE dropping the old one, so there is no window in which two
      // rows could claim the same (account, folderPath).
      await coll.createIndex({ account: 1, folderPath: 1 }, { unique: true });
      console.log('  ✅ created (account, folderPath) unique');
    }
    if (oldIdx) {
      await coll.dropIndex('account_1');
      console.log('  ✅ dropped account_1');
    }
  }

  // ── 3. Report ─────────────────────────────────────────────────────────────
  const rows = await StationAccount.find({}).select('account folderPath deviceId isActive').lean();
  console.log(`\n  ${rows.length} station account(s):`);
  for (const r of rows) {
    console.log(`    ${r.account.padEnd(16)} folder=${JSON.stringify(r.folderPath ?? '')}  active=${r.isActive}`);
  }

  if (!APPLY) console.log('\n  Dry run. Re-run with --apply to write.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
