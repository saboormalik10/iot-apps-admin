/**
 * Start a new database log file (the old one is renamed with a timestamp).
 *
 *   node dist/scripts/rotate-db-log.js
 *
 * Run nightly by maintenance.ps1: mongod keeps its log open and never splits it,
 * so without this one file grows for as long as the PC runs. The maintenance job
 * deletes renamed logs older than 30 days.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set.');
  const client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  try {
    await client.db('admin').command({ logRotate: 1 });
    console.log('database log rotated');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(`log rotation failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
