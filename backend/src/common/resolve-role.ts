import { Types } from 'mongoose';

import { Role } from '../models/Role';
import { sanitizePermissions } from './permissions';

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

/**
 * Turn a caller-supplied `{ role?, roleId? }` into the pair that must be written
 * together on a user.
 *
 * WHY THIS EXISTS
 * Before M25 no endpoint accepted a `roleId` at all: every write derived it from a
 * legacy key validated by `@IsIn(['admin','operator','viewer'])`. Custom roles
 * could therefore be created and edited but never HELD by anyone — the role editor
 * produced rows nothing could point at. This is the missing half.
 *
 * SCOPE IS ENFORCED HERE, not in the DTO: a `roleId` is a caller-supplied
 * reference to another document, so it has to be looked up against the caller's
 * own organisation before it is trusted. A role belonging to another customer is
 * reported as NOT FOUND rather than FORBIDDEN — "forbidden" would confirm the id
 * names a real role in someone else's tenant.
 */
export async function resolveRoleAssignment(
  input: { role?: string | null; roleId?: string | null },
  organizationId: string | Types.ObjectId,
  fallback: 'admin' | 'operator' | 'viewer' = 'viewer',
  grantedBy?: { perms?: string[]; sup?: boolean },
): Promise<{ role: 'admin' | 'operator' | 'viewer'; roleId: Types.ObjectId | null }> {
  const orgId = typeof organizationId === 'string' ? new Types.ObjectId(organizationId) : organizationId;

  if (input.roleId) {
    if (!Types.ObjectId.isValid(input.roleId)) {
      throw Object.assign(new Error('Role not found'), { statusCode: 404, code: 'ROLE_NOT_FOUND' });
    }
    const role = await Role.findOne({
      _id: new Types.ObjectId(input.roleId),
      deletedAt: null,
      // Global (system + shared) roles, or one this organisation owns. Nothing else.
      $or: [{ organizationId: orgId }, { organizationId: null }],
    })
      // `permissions` is REQUIRED here, not incidental: assertCanGrant below reads
      // it, and a projection that omits it makes the escalation check silently inert.
      .select('key baseRole permissions')
      .lean();

    if (!role) {
      throw Object.assign(new Error('Role not found'), { statusCode: 404, code: 'ROLE_NOT_FOUND' });
    }
    assertCanGrant(role.permissions ?? [], grantedBy);
    return { role: (role.baseRole ?? 'viewer') as 'admin' | 'operator' | 'viewer', roleId: role._id as Types.ObjectId };
  }

  const key = (input.role ?? fallback) as 'admin' | 'operator' | 'viewer';
  const roleId = await resolveRoleId(key, orgId);
  if (roleId) {
    const target = await Role.findById(roleId).select('permissions').lean();
    assertCanGrant(target?.permissions ?? [], grantedBy);
  }
  return { role: key, roleId };
}

/**
 * Refuse to grant a permission the granter does not hold themselves.
 *
 * Without this, accepting a `roleId` is a privilege-escalation primitive: an
 * Organisation Admin holds 18 of the 20 permissions, so pointing a new user at any
 * role that happens to carry `role:write` — then signing in as that user, whose
 * password they just set — would hand them grants their own role withholds. The
 * rule is the standard one: you can delegate your authority, never manufacture it.
 *
 * A super admin is exempt, as everywhere else: `sup` is above the permission
 * system rather than a maximal position inside it.
 */
function assertCanGrant(permissions: readonly string[], grantedBy?: { perms?: string[]; sup?: boolean }): void {
  if (!grantedBy || grantedBy.sup === true) return;
  const held = new Set(grantedBy.perms ?? []);
  const excess = sanitizePermissions(permissions).filter((p) => !held.has(p));
  if (excess.length > 0) {
    throw Object.assign(new Error(`You cannot grant permissions you do not hold: ${excess.join(', ')}`), {
      statusCode: 403,
      code: 'INSUFFICIENT_GRANT',
    });
  }
}
