/**
 * Mints access tokens for named users, through the SAME permission resolution
 * the login path uses. Verification aid only — it never changes a password.
 *
 *   npx ts-node src/scripts/mint-verify-token.ts a@b.com c@d.com
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { signAccessToken } from '../utils/jwt';
import { sanitizePermissions, SEEDED_ROLES } from '../common/permissions';
import { User } from '../models/User';
import { Role } from '../models/Role';

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string);
  const out: Record<string, string> = {};

  for (const email of process.argv.slice(2)) {
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`  missing: ${email}`);
      continue;
    }
    let perms: string[] = [];
    if (user.roleId) {
      const role = await Role.findOne({ _id: user.roleId, deletedAt: null }).select('permissions').lean();
      if (role) perms = sanitizePermissions(role.permissions);
    }
    if (perms.length === 0) {
      const seeded = SEEDED_ROLES.find((r) => r.key === user.role);
      perms = seeded ? sanitizePermissions(seeded.permissions) : [];
    }
    out[email.split('@')[0]] = signAccessToken({
      userId: String(user._id),
      organizationId: String(user.organizationId),
      role: user.role,
      email: user.email,
      perms,
      sup: user.isSuperAdmin === true,
    });
    console.error(`  ${email.split('@')[0]}: sup=${user.isSuperAdmin === true} perms(${perms.length}) ${perms.join(' ')}`);
  }

  console.log(JSON.stringify(out));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
