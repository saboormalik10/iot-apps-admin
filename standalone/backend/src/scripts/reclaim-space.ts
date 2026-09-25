/**
 * Ask WiredTiger to return freed space after a large delete.
 *
 * A delete removes documents but does not shrink the files — the space is kept
 * for reuse. That is fine operationally, but Atlas bills dataSize + indexSize,
 * so a collection that lost 99% of its rows can still be charged as if it had
 * not. `compact` rewrites the files and returns the space.
 *
 * Safe to run against live ingest: compaction on MongoDB 4.4+ yields to other
 * operations, and if a write is refused the agent retries — nothing is lost,
 * because the ingest ledger makes retries idempotent.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  const db = mongoose.connection.db!;
  const before = (await db.command({ collStats: 'metmeasures' })) as { size: number; totalIndexSize: number };
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  console.log(`before: data ${mb(before.size)} MB + index ${mb(before.totalIndexSize)} MB`);

  try {
    await db.command({ compact: 'metmeasures' });
    console.log('compact: ok');
  } catch (err) {
    console.log(`compact refused: ${(err as Error).message}`);
    console.log('(shared Atlas tiers do not allow it — the space is reused as new data arrives)');
  }

  const after = (await db.command({ collStats: 'metmeasures' })) as { size: number; totalIndexSize: number };
  console.log(`after : data ${mb(after.size)} MB + index ${mb(after.totalIndexSize)} MB`);
  await mongoose.disconnect();
})();
