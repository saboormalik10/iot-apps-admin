/**
 * Prepare the site database — run by the installer, and safe to run again.
 *
 *   node dist/scripts/setup-site.js
 *
 * 1. The replica set. The database runs as a one-member replica set because
 *    role changes use transactions, and transactions need one. A new database is
 *    not a member of anything yet, so the first run initiates it and waits for it
 *    to become primary.
 * 2. Everything a new install needs (FirstRunService): indexes, the built-in
 *    roles, the site, its station, and the first administrator.
 *
 * THE FIRST ADMINISTRATOR'S PASSWORD is read from this process's environment
 * (STANDALONE_ADMIN_EMAIL / STANDALONE_ADMIN_PASSWORD), which the installer sets
 * for this one run only — it is never written to the settings file on disk.
 *
 * Exit code 0 = ready. Anything else is printed plainly for the technician.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { FirstRunService } from '../setup/first-run.service';
import { User } from '../models/User';

const READY_TIMEOUT_MS = 60_000;

/** The same database, addressed directly: a replica set that is not initiated yet cannot be joined by name. */
function directUri(uri: string): string {
  const u = new URL(uri);
  u.searchParams.delete('replicaSet');
  u.searchParams.set('directConnection', 'true');
  return u.toString();
}

async function ensureReplicaSet(uri: string): Promise<void> {
  const u = new URL(uri);
  const setName = u.searchParams.get('replicaSet');
  if (!setName) {
    console.log('• No replicaSet in MONGO_URI — skipping replica-set setup.');
    return;
  }
  // The driver mongoose ships with — not a separate dependency to keep in step.
  const client = new mongoose.mongo.MongoClient(directUri(uri), { serverSelectionTimeoutMS: 20_000 });
  await client.connect();
  try {
    const admin = client.db('admin');
    try {
      const status = await admin.command({ replSetGetStatus: 1 });
      console.log(`• Replica set "${status.set}" already set up.`);
    } catch (err) {
      const code = (err as { code?: number }).code;
      // 94 NotYetInitialized — a fresh database.
      if (code !== 94) throw err;
      const host = `${u.hostname}:${u.port || '27017'}`;
      await admin.command({ replSetInitiate: { _id: setName, members: [{ _id: 0, host }] } });
      console.log(`• Replica set "${setName}" created on ${host}.`);
    }

    // Wait until this member is primary, or nothing can be written.
    const deadline = Date.now() + READY_TIMEOUT_MS;
    for (;;) {
      const hello = await admin.command({ hello: 1 });
      if (hello.isWritablePrimary) break;
      if (Date.now() > deadline) throw new Error('The database did not become ready within a minute.');
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set.');

  await ensureReplicaSet(uri);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
  const setup = new FirstRunService();
  await setup.onApplicationBootstrap();

  const admins = await User.countDocuments({ role: 'admin', isActive: true, deletedAt: null });
  console.log(`• Site ready: ${admins} active administrator(s).`);
  if (admins === 0) {
    console.log('  No administrator yet — run setup again with the administrator email and password.');
    process.exitCode = 2;
  }
}

main()
  .catch((err) => {
    console.error(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => void 0));
