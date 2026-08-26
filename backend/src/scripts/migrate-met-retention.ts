import 'dotenv/config';
import mongoose from 'mongoose';

import { MetMeasure } from '../models/MetMeasure';
import { MetRecord } from '../models/MetRecord';

/**
 * M14 W3 — retention indexes and index cleanup for the SFTP measure stream.
 *
 * 1. BACKFILL `source`
 *    Pre-existing rows have no `source` field. They are mobile-era data, so they
 *    are labelled explicitly rather than left ambiguous — a null that means "we
 *    don't know" is a trap for every future query.
 *
 * 2. PARTIAL TTL on MetMeasure
 *    30-day retention was agreed with the client for station data. The index is
 *    PARTIAL on `source: 'sftp'` so it can never touch mobile rows. A blanket TTL
 *    here would silently begin deleting the mobile history instead.
 *
 *    It keys on `createdAt` (ingest time), not `timestampMs`:
 *      - `timestampMs` is a Number, and TTL requires a Date;
 *      - a backfilled 90-day-old file then lives 30 days from ingest rather than
 *        being deleted the moment it lands, which is what you actually want.
 *
 * 3. COMPANION TTL on MetRecord
 *    Without it, one empty day-record per station per day accumulates forever and
 *    `measureCount` drifts into meaning "rows ever ingested" rather than "rows
 *    retained". Set to 35 days so a record always outlives its own measures (the
 *    last measure of a day expires ~31 days after the record is created).
 *    `MetDailySummary` keys on deviceId, not recordId, so the aggregates survive.
 *
 * 4. DROP `{ organizationId, tempC }`
 *    Zero reads in $indexStats and no query uses tempC as a filter or sort key —
 *    only as a projection field. At 26M documents an unused index is pure cost on
 *    every insert.
 *
 * Idempotent, and dry-run by default.
 *
 *   npm run migrate:met-retention              # report only
 *   npm run migrate:met-retention -- --apply
 */

const APPLY = process.argv.includes('--apply');

const MEASURE_TTL_SECONDS = 30 * 24 * 60 * 60; // 2,592,000
const RECORD_TTL_SECONDS = 35 * 24 * 60 * 60; // outlives the measures it counts
const DEAD_INDEX = 'organizationId_1_tempC_1';

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
  console.log(`• ${mongoose.connection.name}`);
  console.log(APPLY ? '\n⚠️  APPLY MODE\n' : '\n• DRY RUN — nothing will be written\n');

  const measures = mongoose.connection.db!.collection('metmeasures');
  const records = mongoose.connection.db!.collection('metrecords');

  // ── 1. source backfill ────────────────────────────────────────────────────
  const unlabelled = await MetMeasure.countDocuments({ source: null });
  console.log(`1. rows with no source → 'mobile': ${unlabelled.toLocaleString()}`);
  if (APPLY && unlabelled > 0) {
    const r = await MetMeasure.updateMany({ source: null }, { $set: { source: 'mobile' } });
    console.log(`   labelled ${r.modifiedCount.toLocaleString()}`);
  }

  // ── 2. partial TTL on MetMeasure ──────────────────────────────────────────
  const measureIdx = await measures.indexes();
  const hasMeasureTtl = measureIdx.some((i) => i.expireAfterSeconds !== undefined);
  console.log(`\n2. MetMeasure partial TTL (${MEASURE_TTL_SECONDS}s, source='sftp'): ${hasMeasureTtl ? 'already present' : 'MISSING'}`);
  if (APPLY && !hasMeasureTtl) {
    await measures.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: MEASURE_TTL_SECONDS, partialFilterExpression: { source: 'sftp' }, name: 'sftp_ttl_createdAt' },
    );
    console.log('   created sftp_ttl_createdAt');
  }

  // ── 3. companion TTL on MetRecord ─────────────────────────────────────────
  const recordIdx = await records.indexes();
  const hasRecordTtl = recordIdx.some((i) => i.expireAfterSeconds !== undefined);
  console.log(`\n3. MetRecord partial TTL (${RECORD_TTL_SECONDS}s, source='sftp'): ${hasRecordTtl ? 'already present' : 'MISSING'}`);
  if (APPLY && !hasRecordTtl) {
    await records.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: RECORD_TTL_SECONDS, partialFilterExpression: { source: 'sftp' }, name: 'sftp_ttl_createdAt' },
    );
    console.log('   created sftp_ttl_createdAt');
  }

  // ── 4. drop the unused index ──────────────────────────────────────────────
  const dead = measureIdx.find((i) => i.name === DEAD_INDEX);
  console.log(`\n4. unused index ${DEAD_INDEX}: ${dead ? 'PRESENT — will drop' : 'already gone'}`);
  if (APPLY && dead) {
    await measures.dropIndex(DEAD_INDEX);
    console.log('   dropped');
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  if (APPLY) {
    console.log('\n── Verification ──');
    const m = await measures.indexes();
    const r = await records.indexes();
    const mTtl = m.find((i) => i.expireAfterSeconds !== undefined);
    const rTtl = r.find((i) => i.expireAfterSeconds !== undefined);
    const stillDead = m.some((i) => i.name === DEAD_INDEX);
    const stillNull = await MetMeasure.countDocuments({ source: null });

    console.log(`  ${mTtl ? '✅' : '❌'} MetMeasure TTL   ${mTtl?.expireAfterSeconds}s partial=${JSON.stringify(mTtl?.partialFilterExpression)}`);
    console.log(`  ${rTtl ? '✅' : '❌'} MetRecord TTL    ${rTtl?.expireAfterSeconds}s partial=${JSON.stringify(rTtl?.partialFilterExpression)}`);
    console.log(`  ${stillDead ? '❌' : '✅'} unused index removed`);
    console.log(`  ${stillNull === 0 ? '✅' : '❌'} rows without source: ${stillNull}`);
    if (!mTtl || !rTtl || stillDead || stillNull > 0) process.exitCode = 1;
  } else {
    console.log('\n• Dry run complete. Re-run with --apply.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
