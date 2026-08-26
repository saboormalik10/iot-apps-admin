import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { JWTPayload } from '../../utils/jwt';
import { User } from '../../models/User';

/**
 * Platform-administrator only.
 *
 * A DELIBERATELY SEPARATE guard from `PermissionsGuard`, because the routes
 * behind it are the only ones in the codebase that read across tenant
 * boundaries. Keeping them under their own guard means "what can span
 * customers?" is answerable by grepping for this one symbol, rather than by
 * auditing a permission that could be granted to a customer role by mistake.
 *
 * `isSuperAdmin` is re-read from the DATABASE on every request. The token's
 * `sup` claim is a 15-minute cache, and a demoted administrator must lose
 * cross-customer visibility immediately, not eventually.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();

    // A machine credential must never reach a cross-tenant route. The ingest
    // agent authenticates as itself and holds no role at all.
    if (request['serviceCredential']) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'A service credential cannot be used on this endpoint' },
      });
    }

    const user = request['user'] as JWTPayload | undefined;
    if (!user?.userId) {
      throw new UnauthorizedException({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const live = await User.findById(user.userId).select('isSuperAdmin isActive').lean();
    if (!live || live.isActive === false) {
      throw new UnauthorizedException({ error: { code: 'UNAUTHORIZED', message: 'User no longer active' } });
    }
    if (live.isSuperAdmin !== true) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Platform administrator access required' },
      });
    }
    return true;
  }
}
