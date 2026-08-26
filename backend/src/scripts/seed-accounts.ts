import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

import { Organization } from '../models/Organization';
import { User } from '../models/User';
import { BCRYPT_COST } from '../common/bcrypt';

/**
 * Month 13 · W1 — re-seed logins after `purge:demo --all`.
 *
 * The full wipe deletes every User, so this recreates a minimal, real set of
 * accounts against the surviving Organization. It is NOT the old `seed.ts`: no
 * devices, no records, no demo data — only logins.
 *
 * Passwords are generated at random and printed ONCE. They are not stored
 * anywhere in the repo. Change them after first sign-in.
 *
 * The `admin` role is the highest privilege that exists today. True cross-tenant
 * super admin arrives in M19 (`isSuperAdmin` + org switching); this account is
 * the one that gets promoted then.
 *
 *   npm run seed:accounts                 # create with generated passwords
 *   npm run seed:accounts -- --force      # recreate even if the email exists
 *   npm run seed:accounts -- --force --password 'Admin@1234'   # TEST DBs ONLY
 *
 * Idempotent: an existing email is skipped unless --force is passed.
 */

const FORCE = process.argv.includes('--force');

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/**
 * `--password` sets a KNOWN password for every seeded account instead of
 * generating one. This exists for test databases only: the e2e suite signs in as
 * admin@ and viewer@, so a CI run seeds with a known value and exports it as
 * E2E_ADMIN_PASSWORD / E2E_VIEWER_PASSWORD. Never pass it against production.
 */
const FIXED_PASSWORD = argValue('--password');

/** 16 chars, URL-safe, ~96 bits of entropy. */
function generatePassword(): string {
  return FIXED_PASSWORD ?? randomBytes(12).toString('base64url');
}

interface Seed {
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'operator' | 'viewer';
  note: string;
}

const ACCOUNTS: Seed[] = [
  { email: 'superadmin@observator.com', firstName: 'Super', lastName: 'Admin', role: 'admin', note: 'promoted to isSuperAdmin in M19' },
  { email: 'admin@observator.com', firstName: 'Org', lastName: 'Admin', role: 'admin', note: 'organisation admin' },
  { email: 'operator@observator.com', firstName: 'Field', lastName: 'Operator', role: 'operator', note: 'operator' },
  { email: 'viewer@observator.com', firstName: 'Read', lastName: 'Only', role: 'viewer', note: 'viewer' },
];

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log(`• Connected to ${mongoose.connection.name}\n`);

  const org = await Organization.findOne({ deletedAt: null }).lean();
  if (!org) {
    throw new Error('No organization found. The purge must preserve one, or create it first.');
  }
  console.log(`• Organization: ${org.name} (${String(org._id)})\n`);

  const created: { email: string; password: string; role: string; note: string }[] = [];

  for (const acct of ACCOUNTS) {
    const existing = await User.findOne({ email: acct.email });
    if (existing && !FORCE) {
      console.log(`  • ${acct.email.padEnd(30)} already exists — skipped`);
      continue;
    }
    if (existing) await User.deleteOne({ _id: existing._id });

    const password = generatePassword();
    await User.create({
      organizationId: org._id as Types.ObjectId,
      email: acct.email,
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      firstName: acct.firstName,
      lastName: acct.lastName,
      role: acct.role,
      isActive: true,
    });
    created.push({ email: acct.email, password, role: acct.role, note: acct.note });
    console.log(`  ✅ ${acct.email.padEnd(30)} ${acct.role}`);
  }

  if (created.length) {
    console.log('\n── CREDENTIALS — shown once, not stored ──────────────────────');
    for (const c of created) {
      console.log(`  ${c.email}`);
      console.log(`    password: ${c.password}`);
      console.log(`    role:     ${c.role}  (${c.note})\n`);
    }
    console.log('  ⚠️  Save these now and change them after first sign-in.');
    console.log('  ⚠️  Do not commit them to the repository.');
  } else {
    console.log('\n• Nothing created. Pass --force to recreate existing accounts.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect().catch(() => void 0);
  process.exit(1);
});
