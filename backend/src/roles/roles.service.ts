import { Injectable } from '@nestjs/common';
import mongoose, { Types } from 'mongoose';

import { Role, IRole } from '../models/Role';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { sanitizePermissions, SEEDED_ROLES } from '../common/permissions';

export interface RoleActor {
  userId: string;
  email: string;
  organizationId: string;
  isSuperAdmin: boolean;
  /** True while a super admin is switched into another organisation (M19 W1). */
  isSwitched?: boolean;
}

/** A role plus how many users hold it — the shape the roles table renders. */
export interface RoleWithUsage {
  _id: unknown;
  organizationId: unknown;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  isDefault: boolean;
  userCount: number;
}

export interface RoleInput {
  baseRole?: 'admin' | 'operator' | 'viewer';
  name: string;
  description?: string;
  permissions: string[];
}

const badReq = (msg: string, code = 'VALIDATION_ERROR') =>
  Object.assign(new Error(msg), { statusCode: 400, code });
const notFound = (msg = 'Role not found') => Object.assign(new Error(msg), { statusCode: 404, code: 'NOT_FOUND' });
const forbidden = (msg: string) => Object.assign(new Error(msg), { statusCode: 403, code: 'FORBIDDEN' });

@Injectable()
export class RolesService {
  /**
   * Roles visible to a caller: the shared system roles plus any their own
   * organisation owns. A custom role belonging to another customer is invisible,
   * which is what keeps the role list from leaking one tenant's structure to
   * another.
   */
  async list(actor: RoleActor): Promise<RoleWithUsage[]> {
    // Annotated explicitly: the inferred union of the two filter shapes is large
    // enough that TypeScript refuses to serialise it (TS7056).
    const scope: Record<string, unknown> = actor.isSuperAdmin
      ? { deletedAt: null }
      : { deletedAt: null, $or: [{ organizationId: null }, { organizationId: new Types.ObjectId(actor.organizationId) }] };

    const roles = await Role.find(scope).sort({ organizationId: 1, name: 1 }).lean();

    // The count is what makes deletion safe to reason about (M18 W4) and is
    // cheap: one grouped query rather than one per role.
    const counts = await User.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { roleId: { $in: roles.map((r) => r._id) } } },
      { $group: { _id: '$roleId', n: { $sum: 1 } } },
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));

    return roles.map((r) => ({ ...r, userCount: byId.get(String(r._id)) ?? 0 })) as unknown as RoleWithUsage[];
  }

  async usage(id: string, actor: RoleActor) {
    const role = await this.mustFind(id, actor);
    const filter = { roleId: role._id };
    const [userCount, sample] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select('email firstName lastName').limit(20).lean(),
    ]);
    return {
      roleId: String(role._id),
      name: role.name,
      userCount,
      users: sample,
      // What the dialog offers as a replacement, so the client needs one call.
      replacements: (await this.list(actor))
        .filter((r) => String(r._id) !== String(role._id))
        .map((r) => ({ _id: String(r._id), name: r.name, permissions: r.permissions, isSystem: r.isSystem })),
    };
  }

  /**
   * Delete a role, moving anyone who holds it to a replacement.
   *
   * Soft delete: `deletedAt` is set rather than the document removed, and the
   * unique index on `key` is PARTIAL on `deletedAt: null`, so the key is freed
   * for reuse while the audit trail still resolves.
   *
   * The reassignment and the delete run in ONE transaction. Half-applied, this
   * would leave users pointing at a deleted role — they would silently fall back
   * to the seeded permissions for their legacy key, which is a privilege change
   * nobody asked for.
   */
  async remove(id: string, actor: RoleActor, replacementRoleId?: string) {
    const role = await this.mustFind(id, actor);

    if (role.isSystem && !actor.isSuperAdmin) {
      throw forbidden('System roles can only be deleted by a platform administrator');
    }

    const holders = await User.find({ roleId: role._id }).select('_id organizationId').lean();

    let replacement: IRole | null = null;
    if (holders.length > 0) {
      if (!replacementRoleId) {
        // Not an error the user can fix by retrying — the UI asks them to pick.
        throw Object.assign(new Error(`${holders.length} user(s) hold this role. Choose a replacement.`), {
          statusCode: 409,
          code: 'ROLE_IN_USE',
          details: { userCount: holders.length },
        });
      }
      if (String(replacementRoleId) === String(role._id)) {
        throw badReq('The replacement cannot be the role being deleted');
      }
      replacement = await this.mustFind(replacementRoleId, actor);

      const lockedOut = await this.orgsLockedOutBy(holders, replacement);
      if (lockedOut.length > 0) {
        // Otherwise nobody in that organisation could ever manage users again —
        // including restoring the very permission that was just removed.
        throw Object.assign(
          new Error(
            `That replacement grants no user management, and ${lockedOut.length} organisation(s) would be left ` +
              'with nobody able to manage people. Pick a replacement that includes "Manage people".',
          ),
          { statusCode: 409, code: 'WOULD_LOCK_OUT' },
        );
      }
    }

    const session = await mongoose.startSession();
    let moved = 0;
    try {
      await session.withTransaction(async () => {
        if (replacement) {
          // `role` and `roleId` move TOGETHER — the legacy key is what the JWT and
          // RolesGuard read, so updating one without the other changes what a
          // guard allows without changing what the UI shows.
          const res = await User.updateMany(
            { roleId: role._id },
            { $set: { roleId: replacement._id, role: replacement.key } },
            { session },
          );
          moved = res.modifiedCount;
        }
        await Role.updateOne(
          { _id: role._id },
          { $set: { deletedAt: new Date(), updatedBy: new Types.ObjectId(actor.userId) } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    this.audit(actor, 'delete', role, {
      reassignedTo: replacement ? { id: String(replacement._id), name: replacement.name } : null,
      usersMoved: moved,
    });

    return { deleted: String(role._id), usersMoved: moved, replacementRoleId: replacement ? String(replacement._id) : null };
  }

  /**
   * Organisations that would be left with nobody able to manage users.
   *
   * Super admins are deliberately NOT counted: they can rescue any organisation,
   * so counting them would mask a lockout that is real for the customer.
   */
  private async orgsLockedOutBy(
    holders: { _id: unknown; organizationId: unknown }[],
    replacement: IRole,
  ): Promise<string[]> {
    if (sanitizePermissions(replacement.permissions).includes('user:write')) return [];

    const movingIds = holders.map((h) => h._id);
    const locked: string[] = [];

    for (const orgId of [...new Set(holders.map((h) => String(h.organizationId)))]) {
      const others = await User.find({
        organizationId: new Types.ObjectId(orgId),
        _id: { $nin: movingIds },
        isActive: true,
        isSuperAdmin: { $ne: true },
      })
        .select('role roleId')
        .lean();

      if (!(await this.anyGrantsUserWrite(others))) locked.push(orgId);
    }
    return locked;
  }

  /** True if any of these users holds `user:write`, by role or seeded fallback. */
  private async anyGrantsUserWrite(users: { role: string; roleId?: unknown }[]): Promise<boolean> {
    const roleIds = users.map((u) => u.roleId).filter(Boolean) as Types.ObjectId[];
    const roles = roleIds.length
      ? await Role.find({ _id: { $in: roleIds }, deletedAt: null }).select('permissions').lean()
      : [];
    const byId = new Map(roles.map((r) => [String(r._id), sanitizePermissions(r.permissions)]));

    return users.some((u) => {
      const granted = u.roleId ? byId.get(String(u.roleId)) : undefined;
      if (granted) return granted.includes('user:write');
      // No roleId (or it points at a deleted role) — the guard falls back to the
      // seeded set for the legacy key, so this check must too.
      const seeded = SEEDED_ROLES.find((r) => r.key === u.role);
      return seeded ? seeded.permissions.includes('user:write') : false;
    });
  }

  /**
   * Create a role.
   *
   * A super admin creates SHARED roles (organizationId: null); anyone else can
   * only create one inside their own organisation. That is what stops a customer
   * adding a role every other customer would then see.
   *
   * EXCEPT while switched. `sup` is identity and survives an org switch, so a
   * platform admin acting as a customer used to land in the super-admin branch and
   * create a GLOBAL role — one customer's role, named after them, offered to every
   * other tenant. The switch is exactly the signal that `organizationId` is
   * somebody else's, so it scopes the role to them instead. A shared role is then
   * only ever created deliberately, from the admin's own organisation.
   */
  async create(input: RoleInput, actor: RoleActor) {
    const name = (input.name ?? '').trim();
    if (!name) throw badReq('name is required');

    const permissions = sanitizePermissions(input.permissions ?? []);
    if (permissions.length === 0) throw badReq('A role must grant at least one permission');

    const organizationId =
      actor.isSuperAdmin && !actor.isSwitched ? null : new Types.ObjectId(actor.organizationId);
    const key = slugify(name);

    const clash = await Role.findOne({ organizationId, key, deletedAt: null }).lean();
    if (clash) throw badReq(`A role named "${name}" already exists`, 'DUPLICATE_ROLE');

    const role = await Role.create({
      organizationId,
      key,
      name,
      description: (input.description ?? '').trim(),
      permissions,
      baseRole: input.baseRole ?? 'viewer',
      isSystem: false,
      createdBy: new Types.ObjectId(actor.userId),
    });

    this.audit(actor, 'create', role);
    return role.toObject();
  }

  /**
   * Update a role's name, description or permissions.
   *
   * A system role can be RE-PERMISSIONED but only by a super admin — it is shared
   * by every organisation, so a customer editing it would change everyone's.
   * Its `key` never changes: the JWT and the legacy RolesGuard both read it.
   */
  async update(id: string, input: Partial<RoleInput>, actor: RoleActor) {
    const role = await this.mustFind(id, actor);

    if (role.isSystem && !actor.isSuperAdmin) {
      throw forbidden('System roles can only be edited by a platform administrator');
    }
    if (role.organizationId && !actor.isSuperAdmin && String(role.organizationId) !== actor.organizationId) {
      throw forbidden('That role belongs to another organisation');
    }

    const $set: Record<string, unknown> = { updatedBy: new Types.ObjectId(actor.userId) };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw badReq('name cannot be empty');
      $set.name = name;
      // `key` is deliberately NOT regenerated — see the doc comment above.
    }
    if (input.description !== undefined) $set.description = input.description.trim();
    if (input.permissions !== undefined) {
      const permissions = sanitizePermissions(input.permissions);
      if (permissions.length === 0) throw badReq('A role must grant at least one permission');
      $set.permissions = permissions;
    }
    if (input.baseRole !== undefined) {
      if (role.isSystem) throw badReq('A system role\'s base role is fixed');
      $set.baseRole = input.baseRole;
    }

    const updated = await Role.findByIdAndUpdate(role._id, { $set }, { new: true }).lean();

    // Re-point every holder's legacy mirror in the same operation. `User.role` is
    // what RolesGuard and the frontend read; leaving it behind would mean a role
    // whose permissions say one thing and whose legacy key says another, decided
    // by whichever guard happens to run first.
    if (input.baseRole !== undefined && input.baseRole !== role.baseRole) {
      await User.updateMany({ roleId: role._id }, { $set: { role: input.baseRole } });
    }

    this.audit(actor, 'update', role);
    return updated;
  }

  /** Loads a role the caller is allowed to see, or throws 404. */
  private async mustFind(id: string, actor: RoleActor): Promise<IRole> {
    if (!Types.ObjectId.isValid(id)) throw notFound();
    const role = await Role.findOne({ _id: new Types.ObjectId(id), deletedAt: null });
    if (!role) throw notFound();
    // A role from another organisation reads as absent rather than forbidden, so
    // the response cannot be used to probe which roles other customers have.
    if (!actor.isSuperAdmin && role.organizationId && String(role.organizationId) !== actor.organizationId) {
      throw notFound();
    }
    return role;
  }

  /**
   * Fire-and-forget audit entry.
   * `new Types.ObjectId()` throws SYNCHRONOUSLY on a non-ObjectId, escaping the
   * `.catch()` and 500-ing the request — hence the guard.
   */
  private audit(actor: RoleActor, action: 'create' | 'update' | 'delete', role: IRole, changes?: unknown): void {
    if (!Types.ObjectId.isValid(actor.userId)) return;
    AuditLog.create({
      organizationId: new Types.ObjectId(actor.organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action,
      resourceType: 'role',
      resourceId: String(role._id),
      resourceName: role.name,
      changes: changes ?? null,
    }).catch(() => void 0);
  }
}

/** "Site Supervisor" → "site-supervisor". Stable machine key for a display name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
