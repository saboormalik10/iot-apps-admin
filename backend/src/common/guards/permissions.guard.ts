import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { JWTPayload } from '../../utils/jwt';
import { Permission, SEEDED_ROLES, sanitizePermissions } from '../permissions';
import { Role } from '../../models/Role';
import { User } from '../../models/User';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Require one or more permissions on a route. ALL listed must be held.
 *
 * Applied ALONGSIDE the existing `@Roles()` guard rather than replacing it: there
 * are only nine `@Roles` sites, and migrating them one at a time keeps each change
 * reviewable instead of one sweeping commit that silently alters access.
 */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Permissions whose blast radius is too large to trust a 15-minute token for.
 *
 * Ordinary grants are read from the JWT, so revoking one takes effect within a
 * token lifetime. For these two that lag is unacceptable — deleting a shared role
 * or minting an OS-level station login should stop working the moment the grant
 * is withdrawn — so they cost one indexed lookup on a rare operation.
 */
const REVALIDATE_FROM_DB: ReadonlySet<string> = new Set<Permission>(['role:delete', 'station:provision']);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No metadata → this guard has no opinion, matching RolesGuard's behaviour.
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();

    // A machine credential must never satisfy a user permission. The ingest agent
    // authenticates as itself and has no role; without this an accidental guard
    // ordering could let it reach a user endpoint.
    if (request['serviceCredential']) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'A service credential cannot be used on this endpoint' },
      });
    }

    const user = request['user'] as JWTPayload | undefined;
    if (!user?.userId) {
      throw new UnauthorizedException({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    // Super admin bypasses PERMISSION checks. It does not bypass organisation
    // scoping — that is re-pointed rather than removed (M19), so this cannot
    // widen what data a request sees, only what actions it may take.
    if (user.sup === true) return true;

    const held = new Set(this.permissionsFor(user));
    const missing = required.filter((p) => !held.has(p));

    if (missing.length === 0 && !required.some((p) => REVALIDATE_FROM_DB.has(p))) return true;

    // Re-check the destructive ones against live state, and use that same lookup
    // to resolve anything the token was too old to carry.
    const live = await this.livePermissions(user.userId);
    if (live === null) {
      throw new UnauthorizedException({ error: { code: 'UNAUTHORIZED', message: 'User no longer active' } });
    }
    // A super admin whose token predates the `sup` claim reaches here rather than
    // the short-circuit above, so the wildcard has to be honoured explicitly.
    if (live.has('*')) return true;
    const stillMissing = required.filter((p) => !live.has(p));
    if (stillMissing.length > 0) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: `Missing permission: ${stillMissing.join(', ')}` },
      });
    }
    return true;
  }

  /**
   * Grants from the token, falling back to the seeded set for the legacy `role`.
   *
   * The fallback matters for one release: tokens minted before this shipped carry
   * no `perms`, and treating that as "holds nothing" would lock every signed-in
   * user out until their token expired.
   */
  private permissionsFor(user: JWTPayload): string[] {
    if (user.perms?.length) return user.perms;
    const seeded = SEEDED_ROLES.find((r) => r.key === user.role);
    return seeded ? [...seeded.permissions] : [];
  }

  /** Live grants for a user, or null when they are gone or deactivated. */
  private async livePermissions(userId: string): Promise<Set<string> | null> {
    const user = await User.findById(userId).select('role roleId isActive isSuperAdmin').lean();
    if (!user || user.isActive === false) return null;
    if (user.isSuperAdmin === true) return new Set(['*']);

    if (user.roleId) {
      const role = await Role.findOne({ _id: user.roleId, deletedAt: null }).select('permissions').lean();
      if (role) return new Set(sanitizePermissions(role.permissions));
    }
    const seeded = SEEDED_ROLES.find((r) => r.key === user.role);
    return new Set(seeded ? seeded.permissions : []);
  }
}
