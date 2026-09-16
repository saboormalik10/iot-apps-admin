/**
 * Remove the per-second readings that predate the minute-record change.
 *
 * SCOPE, stated narrowly on purpose:
 *   res missing  → written before Sept 2026, when a record became one MINUTE
 *   source sftp  → station data only. Mobile-app rows also carry no `res`, and
 *                  they are a different dataset with a different retention; a
 *                  broader filter would delete them silently.
 *
 * WHAT ELSE HAS TO MOVE
 * `MetRecord.measureCount` is a stored counter, incremented at ingest. Deleting
 * measures does not touch it, so a day would keep advertising 87,796 readings
 * while holding none — the records list would show a count that no longer
 * describes anything. Counts are recomputed here, and a day left with nothing is
 * removed rather than left as an empty shell.
 *
 * The daily rollups in `metdailysummaries` key on deviceId, not recordId, so the
 * long-term history survives all of this untouched.
 *
 *   npm run purge:legacy-rows              # report only
 *   npm run purge:legacy-rows -- --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { MetMeasure } from '../models/MetMeasure';
import { MetRecord } from '../models/MetRecord';

const APPLY = process.argv.includes('--apply');
const FILTER = { res: { $exists: false }, source: 'sftp' as const };

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  console.log(`• ${mongoose.connection.name}`);
  console.log(APPLY ? '\n⚠️  APPLY MODE — rows will be deleted\n' : '\n• DRY RUN — nothing will be written\n');

  const doomed = await MetMeasure.countDocuments(FILTER);
  const keeping = await MetMeasure.countDocuments({ res: '1m' });
  const other = await MetMeasure.countDocuments({ res: { $exists: false }, source: { $ne: 'sftp' } });

  console.log(`per-second SFTP rows to delete : ${doomed.toLocaleString()}`);
  console.log(`minute records kept            : ${keeping.toLocaleString()}`);
  console.log(`non-SFTP rows untouched        : ${other.toLocaleString()}`);

  // Records that will need their counter rebuilt.
  const affected = (await MetMeasure.distinct('recordId', FILTER)) as mongoose.Types.ObjectId[];
  console.log(`day records affected           : ${affected.length}`);

  if (!APPLY) {
    console.log('\n• Dry run complete. Re-run with --apply.');
    await mongoose.disconnect();
    return;
  }

  const res = await MetMeasure.deleteMany(FILTER);
  console.log(`\ndeleted ${res.deletedCount?.toLocaleString()} rows`);

  let rebuilt = 0;
  let removed = 0;
  for (const recordId of affected) {
    const n = await MetMeasure.countDocuments({ recordId });
    if (n === 0) {
      await MetRecord.deleteOne({ _id: recordId });
      removed += 1;
      continue;
    }
    // Rebuild the span too: the earliest reading may have just been deleted, so
    // a day could still claim it starts hours before its first surviving row.
    const [span] = await MetMeasure.aggregate<{ lo: number; hi: number }>([
      { $match: { recordId } },
      { $group: { _id: null, lo: { $min: '$timestampMs' }, hi: { $max: '$timestampMs' } } },
    ]);
    await MetRecord.updateOne(
      { _id: recordId },
      { $set: { measureCount: n, ...(span ? { dateStartMs: span.lo, dateEndMs: span.hi } : {}) } },
    );
    rebuilt += 1;
  }
  console.log(`rebuilt ${rebuilt} day record(s), removed ${removed} empty one(s)`);

  console.log('\n── Verification ──');
  const left = await MetMeasure.countDocuments(FILTER);
  const stillMinute = await MetMeasure.countDocuments({ res: '1m' });
  console.log(`  ${left === 0 ? '✅' : '❌'} per-second SFTP rows remaining: ${left}`);
  console.log(`  ${stillMinute >= keeping ? '✅' : '❌'} minute records intact: ${stillMinute.toLocaleString()}`);
  if (left !== 0 || stillMinute < keeping) process.exitCode = 1;
  await mongoose.disconnect();
})();
