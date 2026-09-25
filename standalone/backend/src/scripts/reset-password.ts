/**
 * Set a user's password from the site PC — the way back in when the only
 * administrator has forgotten theirs. A site PC has no email, so there is no
 * "forgot password" link to fall back on; sitting at the PC is the authority.
 *
 *   node dist/scripts/reset-password.js --list
 *   node dist/scripts/reset-password.js <email> <new-password>
 *   RESET_PASSWORD=… node dist/scripts/reset-password.js <email>
 *
 * The second form keeps the password off the command line, where other programs
 * on the PC can read it; reset-password.ps1 uses it.
 *
 * (The installer wraps this as reset-password.ps1.) It changes the password and
 * nothing else — role, status and data are untouched — ends the user's sessions,
 * and records the change in the audit log. The database is the one in MONGO_URI,
 * which on a site PC is always the local one.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { User } from '../models/User';
import { RefreshToken } from '../models/RefreshToken';
import { AuditLog } from '../models/AuditLog';
import { BCRYPT_COST } from '../common/bcrypt';

const USAGE = 'Usage: reset-password --list  |  reset-password <email> <new-password>';

async function main(): Promise<void> {
  const [target, argPassword] = process.argv.slice(2);
  const password = argPassword ?? process.env.RESET_PASSWORD;
  if (!target) throw new Error(USAGE);
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set — run this from the install folder.');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15_000 });

  if (target === '--list') {
    const users = await User.find({ deletedAt: null }).sort({ role: 1, email: 1 }).lean();
    console.log(`${users.length} account(s):`);
    for (const u of users) {
      const state = u.pendingApproval ? 'awaiting approval' : u.isActive ? 'active' : 'deactivated';
      console.log(`  ${u.email.padEnd(40)} ${u.role.padEnd(9)} ${state}`);
    }
    return;
  }

  if (!password) throw new Error(USAGE);
  if (password.length < 8) throw new Error('The password must be at least 8 characters.');

  const user = await User.findOne({ email: target.toLowerCase().trim(), deletedAt: null });
  if (!user) throw new Error(`No account "${target}". Run with --list to see them.`);

  user.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  // Chosen by someone at the PC, not handed out by an admin: no forced change.
  user.mustChangePassword = false;
  /**
   * End the sessions this account already has.
   *
   * Revoking refresh tokens alone is not enough: an access token carries its own
   * grants and lives 15 minutes, so the account it was issued to went on working
   * for that long AFTER the reset — the opposite of what someone at the PC is
   * trying to achieve when they use this. `sessionsValidFrom` is what
   * `JwtAuthGuard` checks, and it is what every other reset path sets.
   */
  user.sessionsValidFrom = new Date();
  await user.save();
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });

  await AuditLog.create({
    organizationId: user.organizationId,
    userId: user._id,
    userEmail: 'site PC (reset-password)',
    action: 'update',
    resourceType: 'user',
    resourceId: String(user._id),
    resourceName: user.email,
    changes: { password: 'reset at the site PC' },
  }).catch(() => void 0);

  console.log(`Password set for ${user.email}.`);
  if (!user.isActive) console.log('Note: this account is not active — an administrator must activate it on the Users screen.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => void 0));
