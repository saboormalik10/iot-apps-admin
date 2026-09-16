import 'dotenv/config';
import mongoose from 'mongoose';

/**
 * Change the SFTP retention windows on the LIVE indexes.
 *
 * WHY A SCRIPT AND NOT JUST THE SCHEMA
 * MongoDB does not update a TTL from a re-declaration. `createIndex` with the
 * same key and a different `expireAfterSeconds` raises IndexOptionsConflict, so
 * `autoIndex` silently leaves the old window in place and the model file then
 * documents a retention the database is not applying. `collMod` is the one
 * operation that alters it without dropping and rebuilding the index.
 *
 * WHAT IT DOES NOT DO
 * Nothing is deleted here, and LENGTHENING a window cannot delete anything: rows
 * already past the old cutoff are simply no longer eligible. Shortening one WOULD
 * make the background task start removing rows within the minute, so the script
 * says plainly which direction each change goes and refuses to shorten without
 * `--allow-shorten`.
 *
 *   npm run migrate:met-ttl              # report only
 *   npm run migrate:met-ttl -- --apply
 */

const APPLY = process.argv.includes('--apply');
const ALLOW_SHORTEN = process.argv.includes('--allow-shorten');

/** Keep these in step with the model declarations. */
const TARGETS = [
  { collection: 'metmeasures', index: 'sftp_ttl_createdAt', seconds: 730 * 86_400 },
  // Always longer than the measures', so a day record outlives the readings it counts.
  { collection: 'metrecords', index: 'sftp_ttl_createdAt', seconds: 735 * 86_400 },
];

const days = (s: number) => (s / 86_400).toFixed(0);

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
  const db = mongoose.connection.db!;
  console.log(`• ${mongoose.connection.name}`);
  console.log(APPLY ? '\n⚠️  APPLY MODE\n' : '\n• DRY RUN — nothing will be written\n');

  let shortening = false;
  const plan: { collection: string; index: string; from: number; to: number }[] = [];

  for (const t of TARGETS) {
    const idx = await db.collection(t.collection).indexes();
    const found = idx.find((i) => i.name === t.index);
    if (!found) {
      console.log(`  ${t.collection}.${t.index}: MISSING — run migrate:met-retention first`);
      process.exitCode = 1;
      continue;
    }
    const from = found.expireAfterSeconds as number;
    if (from === t.seconds) {
      console.log(`  ${t.collection}.${t.index}: already ${days(from)} days`);
      continue;
    }
    const dir = t.seconds > from ? 'LENGTHEN' : 'SHORTEN';
    if (dir === 'SHORTEN') shortening = true;
    console.log(`  ${t.collection}.${t.index}: ${days(from)} → ${days(t.seconds)} days  (${dir})`);
    plan.push({ collection: t.collection, index: t.index, from, to: t.seconds });
  }

  if (plan.length === 0) {
    console.log('\n• Nothing to change.');
    await mongoose.disconnect();
    return;
  }

  if (shortening && !ALLOW_SHORTEN) {
    console.log(
      '\n❌ One of these SHORTENS retention, which starts deleting rows past the new cutoff\n' +
        '   within the minute. Re-run with --allow-shorten if that is genuinely intended.',
    );
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log('\n• Dry run complete. Re-run with --apply.');
    await mongoose.disconnect();
    return;
  }

  for (const p of plan) {
    await db.command({
      collMod: p.collection,
      index: { name: p.index, expireAfterSeconds: p.to },
    });
    console.log(`  ✅ ${p.collection}.${p.index} → ${days(p.to)} days`);
  }

  console.log('\n── Verification ──');
  let ok = true;
  for (const t of TARGETS) {
    const idx = await db.collection(t.collection).indexes();
    const found = idx.find((i) => i.name === t.index);
    const good = found?.expireAfterSeconds === t.seconds;
    if (!good) ok = false;
    console.log(`  ${good ? '✅' : '❌'} ${t.collection}.${t.index} = ${found?.expireAfterSeconds}s (want ${t.seconds}s)`);
  }
  if (!ok) process.exitCode = 1;
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
