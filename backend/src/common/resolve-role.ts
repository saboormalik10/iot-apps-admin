import { Types } from 'mongoose';

import { Role } from '../models/Role';

/**
 * The `Role` document a legacy role key maps to, for a given organisation.
 *
 * Every user-creation path must call this. `role` (the key) remains the
 * denormalised mirror the JWT and RolesGuard read, but a user with no `roleId`
 * cannot hold a CUSTOM role, is invisible to the role-usage counts that make
 * deletion safe, and silently falls back to the seeded permission set — so the
 * two must be written together.
 *
 * An organisation's own role of that key wins over the shared system one, so a
 * customer that has customised "Operator" gets theirs. Returns null when nothing
 * matches, which the permission layer still handles via the seeded fallback.
 */
export async function resolveRoleId(
  roleKey: string,
  organizationId: string | Types.ObjectId,
): Promise<Types.ObjectId | null> {
  const orgId = typeof organizationId === 'string' ? new Types.ObjectId(organizationId) : organizationId;

  const role = await Role.findOne({
    key: roleKey,
    deletedAt: null,
    $or: [{ organizationId: orgId }, { organizationId: null }],
  })
    // An org-owned role sorts before the shared one (null sorts first ascending,
    // so descending puts the ObjectId first).
    .sort({ organizationId: -1 })
    .select('_id')
    .lean();

  return (role?._id as Types.ObjectId) ?? null;
}
