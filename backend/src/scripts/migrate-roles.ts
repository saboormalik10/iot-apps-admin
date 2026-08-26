import 'dotenv/config';
import mongoose from 'mongoose';

import { Role } from '../models/Role';
import { User } from '../models/User';
import { SEEDED_ROLES, sanitizePermissions } from '../common/permissions';

/**
 * M18 W1 — seed the three system roles and attach existing users to them.
 *
 * The permission sets are derived from the frontend's existing capability matrix,
 * so nobody's access changes the day this ships: a user who could do something
 * yesterday can still do it today.
 *
 * SAFETY
 * Dry-run by default. Idempotent: re-running re-syncs the seeded roles' names,
 * descriptions and permissions but never touches a custom role, and never
 * re-assigns a user who already has a roleId.
 *
 * A super admin is NEVER created implicitly — pass `--super-admin <email>`.
 *
 *   npm run migrate:roles
 *   npm run migrate:roles -- --apply
 *   npm run migrate:roles -- --apply --super-admin you@example.com
 */

const APPLY = process.argv.includes('--apply');

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
  console.log(`• ${mongoose.connection.name}`);
  console.log(APPLY ? '\n⚠️  APPLY MODE\n' : '\n• DRY RUN — nothing will be written\n');

  // ── 1. System roles ───────────────────────────────────────────────────────
  console.log('1. system roles (organizationId: null)');
  for (const seed of SEEDED_ROLES) {
    const existing = await Role.findOne({ organizationId: null, key: seed.key, deletedAt: null }).lean();
    const perms = sanitizePermissions(seed.permissions);
    const drift =
      existing && JSON.stringify(sanitizePermissions(existing.permissions)) !== JSON.stringify(perms);

    console.log(`   ${seed.key.padEnd(9)} ${existing ? (drift ? 'exists — permissions differ, will re-sync' : 'up to date') : 'MISSING — will create'}  (${perms.length} permissions)`);

    if (APPLY) {
      await Role.findOneAndUpdate(
        { organizationId: null, key: seed.key },
        {
          $set: {
            name: seed.name,
            description: seed.description,
            permissions: perms,
            isSystem: true,
            deletedAt: null,
            isDefault: seed.key === 'viewer',
          },
        },
        { upsert: true, new: true },
      );
    }
  }

  // ── 2. Attach users ───────────────────────────────────────────────────────
  const roles = APPLY ? await Role.find({ organizationId: null, deletedAt: null }).lean() : [];
  const byKey = new Map(roles.map((r) => [r.key, r._id]));

  console.log('\n2. attaching users to their role');
  for (const seed of SEEDED_ROLES) {
    const pending = await User.countDocuments({ role: seed.key, roleId: null });
    console.log(`   role="${seed.key}" without a roleId: ${pending}`);
    if (APPLY && pending > 0) {
      const id = byKey.get(seed.key);
      if (!id) throw new Error(`seeded role ${seed.key} missing after upsert`);
      const r = await User.updateMany({ role: seed.key, roleId: null }, { $set: { roleId: id } });
      console.log(`     attached ${r.modifiedCount}`);
    }
  }

  // Anything whose role is outside the enum would be invisible to the loop above.
  const orphaned = await User.countDocuments({ roleId: null, role: { $nin: SEEDED_ROLES.map((r) => r.key) } });
  if (orphaned > 0) console.log(`   ⚠️  ${orphaned} user(s) have a role outside the seeded set — review manually`);

  // ── 3. isSuperAdmin ───────────────────────────────────────────────────────
  // Mongoose defaults apply only to NEW documents, so existing users have no
  // such field at all and `{ isSuperAdmin: false }` would not match them.
  const missingFlag = await User.countDocuments({ isSuperAdmin: { $exists: false } });
  console.log(`\n3. users missing isSuperAdmin: ${missingFlag}`);
  if (APPLY && missingFlag > 0) {
    const r = await User.updateMany({ isSuperAdmin: { $exists: false } }, { $set: { isSuperAdmin: false } });
    console.log(`   backfilled ${r.modifiedCount}`);
  }

  const promote = argValue('--super-admin');
  if (promote) {
    const user = await User.findOne({ email: promote.toLowerCase().trim() }).lean();
    console.log(`\n   --super-admin ${promote}: ${user ? 'found' : 'NOT FOUND'}`);
    if (APPLY && user) {
      await User.updateOne({ _id: user._id }, { $set: { isSuperAdmin: true } });
      console.log('   promoted');
    }
  } else {
    console.log('\n   (no --super-admin given — never promoted implicitly)');
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  if (APPLY) {
    console.log('\n── Verification ──');
    const seeded = await Role.countDocuments({ organizationId: null, isSystem: true, deletedAt: null });
    const unattached = await User.countDocuments({ roleId: null });
    const noFlag = await User.countDocuments({ isSuperAdmin: { $exists: false } });
    console.log(`  ${seeded === SEEDED_ROLES.length ? '✅' : '❌'} system roles: ${seeded}/${SEEDED_ROLES.length}`);
    console.log(`  ${unattached === 0 ? '✅' : '❌'} users without a roleId: ${unattached}`);
    console.log(`  ${noFlag === 0 ? '✅' : '❌'} users without isSuperAdmin: ${noFlag}`);
    if (seeded !== SEEDED_ROLES.length || unattached > 0 || noFlag > 0) process.exitCode = 1;
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
