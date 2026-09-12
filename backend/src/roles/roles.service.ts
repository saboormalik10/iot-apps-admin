import { Injectable } from '@nestjs/common';
import mongoose, { Types } from 'mongoose';

import { Role, IRole } from '../models/Role';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { sanitizePermissions, SEEDED_ROLES } from '../common/permissions';
import { assertCanGrant } from '../common/resolve-role';

export interface RoleActor {
  userId: string;
  email: string;
  organizationId: string;
  isSuperAdmin: boolean;
  /** True while a super admin is switched into another organisation (M19 W1). */
  isSwitched?: boolean;
  /**
   * The actor's OWN grants, from their token.
   *
   * Carried so a role write can refuse to mint authority the author does not
   * hold. Without it `assertCanGrant` cannot tell an escalation from a normal
   * edit, and the check silently passes everything.
   */
  perms?: string[];
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
   * Roles visible to a caller.
   *
   * A platform administrator sees everything. A customer sees three things:
   *
   *   1. the BUILT-IN roles (`isSystem`) — the vocabulary everyone shares;
   *   2. roles their OWN organisation created;
   *   3. a shared CUSTOM role only once one of their own people actually holds
   *      it — assigned by a platform administrator.
   *
   * (3) is the rule that changed. Every shared role used to be visible to every
   * customer, so a role built for one customer ("Site Supervisor", held by
   * nobody) appeared in everyone's list — clutter at best, and at worst it
   * described access arrangements that were none of their business. Showing it
   * once somebody holds it is the case where they genuinely need it: otherwise
   * one of their users would have permissions they could not account for.
   *
   * A custom role belonging to another customer remains invisible either way,
   * which is what keeps the list from leaking one tenant's structure to another.
   */
  async list(actor: RoleActor): Promise<RoleWithUsage[]> {
    // Annotated explicitly: the inferred union of the filter shapes is large
    // enough that TypeScript refuses to serialise it (TS7056).
    let scope: Record<string, unknown>;

    if (actor.isSuperAdmin) {
      scope = { deletedAt: null };
    } else {
      const orgId = new Types.ObjectId(actor.organizationId);
      // Shared custom roles this organisation's LIVE people hold. A tombstoned
      // user must not keep a role on screen for a customer.
      const heldShared = await User.distinct('roleId', {
        organizationId: orgId,
        deletedAt: null,
        roleId: { $ne: null },
      });
      scope = {
        deletedAt: null,
        $or: [
          { organizationId: null, isSystem: true },
          { organizationId: orgId },
          { organizationId: null, _id: { $in: heldShared } },
        ],
      };
    }

    const roles = await Role.find(scope).sort({ organizationId: 1, name: 1 }).lean();

    // The count is what makes deletion safe to reason about (M18 W4) and is
    // cheap: one grouped query rather than one per role.
    /**
     * `deletedAt: null` matters: removing a user tombstones the row rather than
     * dropping it, and the tombstone keeps its `roleId`. Without it, Viewer read
     * "20 people" for a role one live person holds — and that number is the whole
     * basis on which someone decides a role is safe to delete.
     *
     * The ORGANISATION scope matters for a different reason. The built-in roles
     * are shared, so an unscoped count told each customer how many people every
     * OTHER customer has. A customer is shown their own holders; only a platform
     * administrator sees the total.
     */
    const countMatch: Record<string, unknown> = {
      roleId: { $in: roles.map((r) => r._id) },
      deletedAt: null,
    };
    if (!actor.isSuperAdmin) countMatch.organizationId = new Types.ObjectId(actor.organizationId);

    const counts = await User.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: countMatch },
      { $group: { _id: '$roleId', n: { $sum: 1 } } },
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));

    return roles.map((r) => ({ ...r, userCount: byId.get(String(r._id)) ?? 0 })) as unknown as RoleWithUsage[];
  }

  async usage(id: string, actor: RoleActor) {
    const role = await this.mustFind(id, actor);
    /**
     * Live holders only — a tombstoned user keeps its roleId, and this count is
     * exactly what the delete dialog uses to say "N people will be reassigned".
     *
     * SCOPED TO THE CALLER'S ORGANISATION, which it was not. This returns each
     * holder's name and email address, and the built-in roles are SHARED — so
     * any customer, Viewer included (they hold `role:read`), could ask who holds
     * "Organisation Admin" and be handed the names and addresses of people at
     * every other customer.
     */
    const filter: Record<string, unknown> = { roleId: role._id, deletedAt: null };
    if (!actor.isSuperAdmin) filter.organizationId = new Types.ObjectId(actor.organizationId);
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

    this.assertCanModify(role, actor);

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
    // Every permission on a NEW role is an addition, so all of them are checked.
    // You may delegate your authority; you may not manufacture it.
    assertCanGrant(permissions, { perms: actor.perms, sup: actor.isSuperAdmin });

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

    this.assertCanModify(role, actor);

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
      /**
       * Only the ADDED permissions are checked, not the whole list.
       *
       * Checking everything would block an ordinary edit: a role created by a
       * platform administrator can legitimately carry a grant the customer admin
       * editing its NAME does not hold, and the editor submits the full list on
       * every save. Removing a permission is always allowed, and keeping one that
       * is already there gains the author nothing — only additions can escalate.
       */
      const existing = new Set(sanitizePermissions(role.permissions ?? []));
      const added = permissions.filter((p) => !existing.has(p));
      assertCanGrant(added, { perms: actor.perms, sup: actor.isSuperAdmin });
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
  /**
   * May this caller CHANGE this role?
   *
   * A customer owns only what their own organisation created. Everything with
   * `organizationId: null` belongs to the platform — the built-in roles and any
   * shared custom one a platform administrator built — and is read-only to them.
   *
   * This replaces an `isSystem` check that was too narrow. `isSystem` is true of
   * the three built-ins only, so a shared CUSTOM role ("Site Supervisor") was
   * shared with every customer and editable and deletable by any of them. That
   * did not bite while no customer held `role:write`; granting it makes the gap
   * live, so it is closed first.
   */
  private assertCanModify(role: IRole, actor: RoleActor): void {
    if (actor.isSuperAdmin) return;
    if (!role.organizationId) {
      throw forbidden(
        role.isSystem
          ? 'Built-in roles can only be changed by a platform administrator'
          : 'Shared roles can only be changed by a platform administrator',
      );
    }
    // Another customer's role reads as absent, never as forbidden — see mustFind.
    if (String(role.organizationId) !== actor.organizationId) throw notFound();
  }

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
