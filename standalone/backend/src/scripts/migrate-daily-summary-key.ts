import 'dotenv/config';
import mongoose from 'mongoose';

import { MetDailySummary } from '../models/MetDailySummary';

/**
 * M14 W4 — re-key MET daily summaries on the local date string.
 *
 * THE BUG
 * The unique key was `{ deviceId, dateMs }`, a millisecond instant. Two callers
 * computing a day-start even slightly differently — one from `localDayBounds`,
 * one from a record's first reading — produced TWO rows for the same calendar
 * day instead of updating one. Observed live: 2026-08-21 existed twice, at
 * 14:00:00.000Z and 14:02:00.000Z.
 *
 * `date` ('YYYY-MM-DD' in the organisation's timezone) is stable no matter how
 * the bounds were derived, and it compares lexicographically so range queries
 * need no timezone arithmetic.
 *
 * WHAT THIS DOES
 *   1. Collapses duplicate (deviceId, date) rows, keeping the most recently
 *      computed one — it was produced by the current code path.
 *   2. Drops the old { deviceId, dateMs } unique index.
 *   3. Creates { deviceId, date } unique, plus a plain { deviceId, dateMs } for
 *      the sort paths that still use it.
 *
 * Idempotent, dry-run by default.
 *
 *   npm run migrate:daily-summary-key
 *   npm run migrate:daily-summary-key -- --apply
 */

const APPLY = process.argv.includes('--apply');
const OLD_INDEX = 'deviceId_1_dateMs_-1';

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
  console.log(`• ${mongoose.connection.name}`);
  console.log(APPLY ? '\n⚠️  APPLY MODE\n' : '\n• DRY RUN — nothing will be written\n');

  // ── 1. Duplicates ─────────────────────────────────────────────────────────
  const dupes = await MetDailySummary.aggregate<{ _id: { deviceId: unknown; date: string }; ids: unknown[]; n: number }>([
    { $group: { _id: { deviceId: '$deviceId', date: '$date' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);

  console.log(`1. duplicate (deviceId, date) groups: ${dupes.length}`);
  let toRemove = 0;
  for (const d of dupes) {
    console.log(`   ${d._id.date}: ${d.n} rows`);
    toRemove += d.n - 1;
  }

  if (APPLY && dupes.length) {
    for (const d of dupes) {
      // Keep the newest by computedAt — it came from the current code path.
      const rows = await MetDailySummary.find({ _id: { $in: d.ids } }).sort({ computedAt: -1 }).select('_id').lean();
      const [keep, ...drop] = rows;
      await MetDailySummary.deleteMany({ _id: { $in: drop.map((r) => r._id) } });
      console.log(`   ${d._id.date}: kept ${String(keep._id)}, removed ${drop.length}`);
    }
  }

  // ── 2 & 3. Indexes ────────────────────────────────────────────────────────
  const coll = mongoose.connection.db!.collection('metdailysummaries');
  const before = await coll.indexes();
  const hasOld = before.some((i) => i.name === OLD_INDEX && i.unique);
  const hasNew = before.some((i) => i.name === 'deviceId_1_date_1');

  console.log(`\n2. old unique ${OLD_INDEX}: ${hasOld ? 'PRESENT — will drop' : 'already gone'}`);
  console.log(`3. new unique deviceId_1_date_1: ${hasNew ? 'already present' : 'MISSING'}`);

  if (APPLY) {
    if (!hasNew) {
      await coll.createIndex({ deviceId: 1, date: 1 }, { unique: true });
      console.log('   created deviceId_1_date_1');
    }
    if (hasOld) {
      await coll.dropIndex(OLD_INDEX);
      // Keep a non-unique version: some reads still sort by dateMs.
      await coll.createIndex({ deviceId: 1, dateMs: -1 });
      console.log(`   dropped ${OLD_INDEX}, recreated non-unique`);
    }

    console.log('\n── Verification ──');
    const after = await coll.indexes();
    const uniqueOnDate = after.some((i) => i.name === 'deviceId_1_date_1' && i.unique);
    const oldGone = !after.some((i) => i.name === OLD_INDEX && i.unique);
    const stillDupe = await MetDailySummary.aggregate([
      { $group: { _id: { deviceId: '$deviceId', date: '$date' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]);
    console.log(`  ${uniqueOnDate ? '✅' : '❌'} unique on (deviceId, date)`);
    console.log(`  ${oldGone ? '✅' : '❌'} old unique index removed`);
    console.log(`  ${stillDupe.length === 0 ? '✅' : '❌'} duplicates remaining: ${stillDupe.length}`);
    if (!uniqueOnDate || !oldGone || stillDupe.length) process.exitCode = 1;
  } else {
    console.log(`\n• Would remove ${toRemove} duplicate row(s). Re-run with --apply.`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
