import 'dotenv/config';
import mongoose from 'mongoose';
import { mkdirSync, writeFileSync } from 'fs';
import { EJSON } from 'bson';
import { join } from 'path';

/**
 * Snapshot every collection to newline-delimited JSON before a destructive change.
 *
 * Exists because `mongodump` is not installed on the dev machine and Months 13–15
 * run several irreversible migrations (the demo purge, the isDemoMode drop, the
 * partial TTL index). A dump is cheap insurance at this data volume.
 *
 *   npm run backup:db                     # → ./backups/<db>-<timestamp>/
 *   npm run backup:db -- --out /some/dir
 *
 * Restore with the companion script — `mongoimport` is NOT installed here, which
 * is why this script exists at all, so pointing at it was advice nobody could
 * follow:
 *   npx ts-node src/scripts/restore-db.ts --from <dir> --to <database>
 * or replay it through mongoose if mongoimport is unavailable.
 *
 * NOT a substitute for Atlas point-in-time backup — this is a local convenience
 * snapshot, taken immediately before a known-destructive step.
 */

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = argValue('--out') ?? join(process.cwd(), 'backups', `${mongoose.connection.name}-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  console.log(`• Database: ${mongoose.connection.name}`);
  console.log(`• Output:   ${outDir}\n`);

  const collections = await db.listCollections().toArray();
  let grandTotal = 0;

  for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    const docs = await db.collection(name).find({}).toArray();
    // Newline-delimited JSON: streamable, and mongoimport reads it directly.
    // EJSON, not JSON.stringify: a plain stringify turns every ObjectId into a
    // string and every Date into an ISO string, so a restore rebuilds documents
    // whose `_id` and references are STRINGS. Nothing errors — the data simply
    // no longer joins to anything. Found during the M23 W2 restore rehearsal,
    // which is exactly what a rehearsal is for.
    const body = docs.map((d) => EJSON.stringify(d, { relaxed: false })).join('\n');
    writeFileSync(join(outDir, `${name}.jsonl`), body ? `${body}\n` : '');
    grandTotal += docs.length;
    console.log(`  ${name.padEnd(28)} ${docs.length.toLocaleString('en-US').padStart(10)}`);
  }

  console.log(`\n✅ ${grandTotal.toLocaleString('en-US')} documents across ${collections.length} collections`);
  console.log(`   ${outDir}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
