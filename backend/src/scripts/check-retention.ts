/**
 * Verify that retention is actually happening.
 *
 * A TTL index that stops deleting raises NOTHING — the collection simply grows
 * until the disk fills, and the first symptom is an outage. So this asserts the
 * observable: the oldest document must not be older than its TTL plus the
 * monitor's lag.
 *
 * Exits non-zero when something is wrong, so it can be a cron line or a CI gate:
 *   npx ts-node src/scripts/check-retention.ts
 *
 * It also reports the CURRENT collection sizes, which is the number that tells
 * you whether the projection in the plan still holds.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

/** collection → [ttl field, expected days, filter that selects the TTL'd subset] */
const EXPECTED: Array<{ collection: string; field: string; days: number; filter: Record<string, unknown> }> = [
  { collection: 'metmeasures', field: 'createdAt', days: 30, filter: { source: 'sftp' } },
  { collection: 'metrecords', field: 'createdAt', days: 35, filter: { source: 'sftp' } },
  { collection: 'metingestfiles', field: 'receivedAt', days: 45, filter: {} },
];

/** MongoDB's TTL monitor runs every 60s but lags under load; allow slack. */
const GRACE_DAYS = 2;

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db!;
  console.log(`• ${mongoose.connection.name}\n`);

  let failed = 0;

  for (const e of EXPECTED) {
    const col = db.collection(e.collection);
    const indexes = await col.indexes();
    const ttl = indexes.find((i) => (i as { expireAfterSeconds?: number }).expireAfterSeconds !== undefined) as
      | { name?: string; expireAfterSeconds?: number; partialFilterExpression?: unknown }
      | undefined;

    if (!ttl) {
      console.log(`  ❌ ${e.collection.padEnd(18)} NO TTL INDEX — this collection grows without bound`);
      failed += 1;
      continue;
    }

    const actualDays = (ttl.expireAfterSeconds ?? 0) / 86_400;
    if (Math.abs(actualDays - e.days) > 0.5) {
      console.log(`  ❌ ${e.collection.padEnd(18)} TTL is ${actualDays} days, expected ${e.days}`);
      failed += 1;
      continue;
    }

    const oldest = await col.find(e.filter).sort({ [e.field]: 1 }).limit(1).toArray();
    const count = await col.estimatedDocumentCount();

    if (!oldest[0]?.[e.field]) {
      console.log(`  ·  ${e.collection.padEnd(18)} TTL ${e.days}d present, nothing retained yet (${count.toLocaleString()} docs)`);
      continue;
    }

    const ageDays = (Date.now() - new Date(oldest[0][e.field] as Date).getTime()) / 86_400_000;
    const overdue = ageDays > e.days + GRACE_DAYS;
    if (overdue) failed += 1;

    console.log(
      `  ${overdue ? '❌' : '✅'} ${e.collection.padEnd(18)} TTL ${String(e.days).padStart(2)}d  oldest ${ageDays.toFixed(1).padStart(5)}d  ${count.toLocaleString().padStart(12)} docs` +
        (overdue ? '  ← NOT BEING DELETED' : ''),
    );
  }

  if (failed) {
    console.log(`\n❌ ${failed} retention problem(s). A TTL that stops running is invisible until the disk fills.`);
  } else {
    console.log('\n✅ Retention is working.');
  }

  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
