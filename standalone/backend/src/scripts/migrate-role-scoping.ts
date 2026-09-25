import 'dotenv/config';
import mongoose from 'mongoose';

import { Organization } from '../models/Organization';
import { Role } from '../models/Role';
import { SEEDED_ROLES, sanitizePermissions } from '../common/permissions';

/**
 * M25 — bring existing role documents in line with the roles/permissions fixes.
 *
 * FOUR THINGS, all of which exist only because of defects this migration
 * accompanies:
 *
 *  1. `baseRole` — new on Role. Without it a custom role cannot be assigned to
 *     anyone, because `User.role` (still read by RolesGuard, the JWT and the
 *     frontend) would have nothing to mirror. System roles take their own key;
 *     custom roles default to `viewer`, the least-privileged answer.
 *
 *  2. Seeded grants re-synced to the catalogue — `ingest:read` and `share:create`
 *     no longer exist. The first guarded nothing (no endpoint ever exposed ingest
 *     history); the second duplicated `data:export`, whose own label is "Export
 *     data and create share links". POST /share is gated on `data:export`, so no
 *     role loses a capability.
 *
 *  3. The same stale grants dropped from custom roles. Stored grants outlive the
 *     catalogue, so they are cleaned here rather than left to `sanitizePermissions`
 *     to hide at read time.
 *
 *  4. Stray GLOBAL custom roles — a super admin acting as a customer used to create
 *     roles with `organizationId: null`, so one customer's role became visible and
 *     assignable to every other tenant. Any global non-system role whose name
 *     matches an organisation is re-scoped to it. Anything else is REPORTED, never
 *     deleted: a role nobody can identify is a decision for a human.
 *
 * SAFETY: dry-run by default, idempotent.
 *
 *   npm run migrate:role-scoping
 *   npm run migrate:role-scoping -- --apply
 */

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
  console.log(`• ${mongoose.connection.name}`);
  console.log(APPLY ? '\n⚠️  APPLY MODE\n' : '\n• DRY RUN — nothing will be written\n');

  const roles = await Role.find({ deletedAt: null }).lean();
  const orgs = await Organization.find({}).select('name').lean();
  const byName = new Map(orgs.map((o) => [String(o.name).trim().toLowerCase(), o._id]));

  // ---- 1. baseRole ------------------------------------------------------
  console.log('1. baseRole');
  for (const r of roles) {
    if (r.baseRole) {
      console.log(`   = ${r.name} already ${r.baseRole}`);
      continue;
    }
    const base = r.isSystem && ['admin', 'operator', 'viewer'].includes(r.key) ? r.key : 'viewer';
    console.log(`   → ${r.name} = ${base}${r.isSystem ? '' : '  (custom → least privilege)'}`);
    if (APPLY) await Role.updateOne({ _id: r._id }, { $set: { baseRole: base } });
  }

  // ---- 2 + 3. re-sync the seeded grants ---------------------------------
  console.log('\n2. seeded permission sets');
  for (const seed of SEEDED_ROLES) {
    const role = roles.find((r) => r.key === seed.key && r.organizationId === null && r.isSystem);
    if (!role) {
      console.log(`   ! ${seed.key} not found — run migrate:roles first`);
      continue;
    }
    const want = sanitizePermissions(seed.permissions);
    const have = sanitizePermissions(role.permissions ?? []);
    const added = want.filter((p) => !have.includes(p));
    const wantSet = new Set<string>(want);
    const removed = (role.permissions ?? []).filter((p) => !wantSet.has(p));
    if (!added.length && !removed.length) {
      console.log(`   = ${seed.name} unchanged (${want.length})`);
      continue;
    }
    console.log(`   → ${seed.name}: +[${added.join(', ') || '—'}] -[${removed.join(', ') || '—'}]`);
    if (APPLY) await Role.updateOne({ _id: role._id }, { $set: { permissions: want } });
  }

  console.log('\n3. stale grants on custom roles');
  for (const r of roles.filter((x) => !x.isSystem)) {
    const clean = sanitizePermissions(r.permissions ?? []);
    const cleanSet = new Set<string>(clean);
    const dropped = (r.permissions ?? []).filter((p) => !cleanSet.has(p));
    if (!dropped.length) continue;
    console.log(`   → ${r.name}: drop [${dropped.join(', ')}]`);
    if (APPLY) await Role.updateOne({ _id: r._id }, { $set: { permissions: clean } });
  }

  // ---- 4. stray global custom roles -------------------------------------
  console.log('\n4. global custom roles (visible to EVERY tenant)');
  const strays = roles.filter((r) => !r.isSystem && r.organizationId === null);
  if (!strays.length) console.log('   = none');
  for (const r of strays) {
    const match = byName.get(String(r.name).trim().toLowerCase());
    if (match) {
      console.log(`   → "${r.name}" (${(r.permissions ?? []).length} perms) → organisation "${r.name}"`);
      if (APPLY) await Role.updateOne({ _id: r._id }, { $set: { organizationId: match } });
    } else {
      console.log(
        `   ! "${r.name}" (${(r.permissions ?? []).length} perms) is global and matches no organisation.\n` +
          `     LEFT AS IS — decide manually: scope it to one customer, or delete it in the roles screen.`,
      );
    }
  }

  await mongoose.disconnect();
  console.log(APPLY ? '\n✓ applied' : '\n• dry run complete — re-run with --apply');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
