/**
 * Index review at 50+ stations (M23 W1).
 *
 * Every change here came from measuring, not from reading the schema:
 *
 * 1. `metrecords {deviceId, dayKey}` is UNIQUE PARTIAL on `{dayKey: {$type:
 *    'string'}}`. MongoDB only uses a partial index when the query is provably a
 *    subset of its filter, and an equality on a string literal does NOT satisfy
 *    `$type` — the planner did not even CONSIDER it (empty rejectedPlans). So
 *    the ingest lookup fell back to `{deviceId, dateStartMs}` and scanned every
 *    day record for that device.
 *
 *    That is the hottest read in the system: once per ingested file, 1,440 times
 *    per station per day. After a year each station has ~365 day records, so at
 *    50 stations it is ~26M key reads/day to find ONE document. Adding a plain
 *    compound index makes it a point read; the unique partial stays, because it
 *    is the CONSTRAINT and a plain unique index would collide on the mobile-era
 *    `dayKey: null` rows — exactly the trap M14 already hit once.
 *
 * 2. `metmeasures {recordId, rowType}` is a strict PREFIX of
 *    `{recordId, rowType, timestampMs}` and neither is unique, so it can never
 *    be the better plan. On the collection that holds ~26M documents, a
 *    redundant index is a pointless write on every one of 4.3M daily inserts.
 *
 * 3. `devices {organizationId, bleId, type}` UNIQUE is implied by
 *    `{organizationId, bleId}` UNIQUE, which is strictly stronger. Keeping both
 *    costs a write and misleads: it suggests one bleId could exist twice with
 *    different types, which the narrower index already forbids.
 *
 * 4. `metrecords {organizationId, userId}` — nothing queries it. `userId` was
 *    mobile-era attribution; the field is still written, but no read path uses it.
 *
 *   npx ts-node src/scripts/migrate-indexes-m23.ts [--apply]
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

interface Change {
  collection: string;
  action: 'create' | 'drop';
  name: string;
  key?: Record<string, 1 | -1>;
  options?: Record<string, unknown>;
  why: string;
}

const CHANGES: Change[] = [
  {
    collection: 'metrecords',
    action: 'create',
    name: 'deviceId_1_dayKey_1_deletedAt_1',
    key: { deviceId: 1, dayKey: 1, deletedAt: 1 },
    why: 'the ingest day lookup — the unique PARTIAL index is ineligible for it',
  },
  {
    collection: 'metmeasures',
    action: 'drop',
    name: 'recordId_1_rowType_1',
    why: 'strict prefix of recordId_1_rowType_1_timestampMs_-1; neither unique',
  },
  {
    collection: 'devices',
    action: 'drop',
    name: 'organizationId_1_bleId_1_type_1',
    why: 'implied by the stronger unique {organizationId, bleId}',
  },
  {
    collection: 'metrecords',
    action: 'drop',
    name: 'organizationId_1_userId_1',
    why: 'no read path queries records by userId',
  },
];

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 15_000 });
  console.log(`• ${mongoose.connection.name}  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);
  const db = mongoose.connection.db!;

  for (const c of CHANGES) {
    const existing = await db.collection(c.collection).indexes();
    const present = existing.some((i) => i.name === c.name);

    if (c.action === 'create') {
      if (present) {
        console.log(`  ·  ${c.collection}.${c.name} already exists`);
        continue;
      }
      console.log(`  ✅ CREATE ${c.collection}.${c.name} — ${c.why}`);
      // Background build: this runs against a live collection.
      if (APPLY) await db.collection(c.collection).createIndex(c.key!, { name: c.name, ...(c.options ?? {}) });
    } else {
      if (!present) {
        console.log(`  ·  ${c.collection}.${c.name} already gone`);
        continue;
      }
      console.log(`  ✅ DROP   ${c.collection}.${c.name} — ${c.why}`);
      if (APPLY) await db.collection(c.collection).dropIndex(c.name);
    }
  }

  if (!APPLY) console.log('\n  Dry run. Re-run with --apply to write.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
