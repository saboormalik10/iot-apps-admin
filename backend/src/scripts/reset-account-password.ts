/**
 * Set a known password on a seeded account, touching NOTHING else.
 *
 * `seed-accounts --force` deletes and recreates the user, which since M18 W1 also
 * discards `roleId` and `isSuperAdmin` — so it is the wrong tool for "I lost the
 * password". This updates `passwordHash` alone.
 *
 *   npx ts-node src/scripts/reset-account-password.ts <email> <password>
 *   npx ts-node src/scripts/reset-account-password.ts --all <password>
 *
 * Development only. Refuses to run against a database whose name looks like
 * production, since a silent password reset there would be an outage.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { User } from '../models/User';
import { BCRYPT_COST } from '../common/bcrypt';

const DEV_ACCOUNTS = [
  'superadmin@observator.com',
  'admin@observator.com',
  'operator@observator.com',
  'viewer@observator.com',
];

async function main(): Promise<void> {
  const [target, password] = process.argv.slice(2);
  if (!target || !password) {
    throw new Error('Usage: reset-account-password.ts <email|--all> <password>');
  }
  if (password.length < 8) throw new Error('Password must be at least 8 characters');

  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 15_000 });
  const dbName = mongoose.connection.name;
  if (/prod/i.test(dbName)) {
    throw new Error(`Refusing to reset passwords on "${dbName}" — this looks like production.`);
  }
  console.log(`• Database: ${dbName}\n`);

  const emails = target === '--all' ? DEV_ACCOUNTS : [target];
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  for (const email of emails) {
    // $set on passwordHash only: roleId, isSuperAdmin, isActive and the
    // organisation link all survive untouched.
    const res = await User.updateOne({ email }, { $set: { passwordHash } });
    const found = res.matchedCount > 0;
    console.log(`  ${found ? '✅' : '⚠️ '} ${email.padEnd(32)} ${found ? 'password set' : 'no such user'}`);
  }

  console.log('\n  ⚠️  Development credentials. Do not use this against production.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
