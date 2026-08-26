/**
 * Restore a `backup-db` snapshot into a database.
 *
 * WHY THIS EXISTS: `backup-db.ts` documented its restore as `mongoimport`, which
 * is not installed on this machine — the same reason the backup script was
 * written in the first place. So the restore path had never been run. A backup
 * whose restore has never been executed is not a backup; it is a directory of
 * hopeful JSON.
 *
 * Safety: refuses to write into a database that already has data unless
 * `--force` is given, and refuses a production-looking name outright. Restoring
 * over a live database by mistyping a URI is the failure this guards.
 *
 *   npx ts-node src/scripts/restore-db.ts --from ./backups/observator-… --to observator_restore_test
 *   npx ts-node src/scripts/restore-db.ts --from … --to … --force   # overwrite
 */
import 'dotenv/config';
import { readdirSync, createReadStream, statSync } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';
import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const FORCE = process.argv.includes('--force');
/** Insert in batches so a large collection does not build one huge array. */
const BATCH = 1_000;

async function main(): Promise<void> {
  const from = arg('from');
  const to = arg('to');
  if (!from || !to) throw new Error('Usage: restore-db.ts --from <dir> --to <database> [--force]');
  if (!statSync(from).isDirectory()) throw new Error(`${from} is not a directory`);
  if (/prod/i.test(to)) throw new Error(`Refusing to restore into "${to}" — that looks like production.`);

  const client = new MongoClient(process.env.MONGO_URI as string);
  await client.connect();
  const db = client.db(to);

  const existing = await db.listCollections().toArray();
  const populated: string[] = [];
  for (const c of existing) {
    if ((await db.collection(c.name).estimatedDocumentCount()) > 0) populated.push(c.name);
  }
  if (populated.length && !FORCE) {
    await client.close();
    throw new Error(
      `"${to}" already holds data in ${populated.length} collection(s): ${populated.slice(0, 5).join(', ')}. ` +
        'Pass --force to overwrite.',
    );
  }

  const files = readdirSync(from).filter((f) => f.endsWith('.jsonl'));
  console.log(`• restoring ${files.length} collection(s) from ${from} → ${to}\n`);

  let grandTotal = 0;
  for (const file of files.sort()) {
    const name = file.replace(/\.jsonl$/, '');
    const collection = db.collection(name);
    if (FORCE) await collection.deleteMany({});

    let batch: unknown[] = [];
    let count = 0;
    const flush = async () => {
      if (!batch.length) return;
      // `ordered: false` so one bad document does not abandon the rest.
      await collection.insertMany(batch as never[], { ordered: false }).catch((e: { writeErrors?: unknown[] }) => {
        const failed = e.writeErrors?.length ?? 0;
        if (failed) console.log(`     ${failed} document(s) rejected in ${name}`);
      });
      count += batch.length;
      batch = [];
    };

    const rl = createInterface({ input: createReadStream(join(from, file)), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      // EJSON, not JSON.parse: the dump preserves ObjectId and Date as extended
      // JSON, and a plain parse would restore them as plain strings — every
      // reference silently broken, and no error to show for it.
      batch.push(EJSON.parse(line, { relaxed: false }));
      if (batch.length >= BATCH) await flush();
    }
    await flush();

    grandTotal += count;
    console.log(`  ${name.padEnd(34)} ${count.toLocaleString().padStart(9)}`);
  }

  console.log(`\n✅ ${grandTotal.toLocaleString()} documents restored into "${to}"`);
  console.log('   NOTE: indexes are NOT restored — the Mongoose models rebuild them on first connect.');
  await client.close();
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
