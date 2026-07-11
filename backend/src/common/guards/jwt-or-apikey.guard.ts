import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyAccessToken } from '../../utils/jwt';

/**
 * Verifies a per-user JWT (admin panel OR mobile app). The mobile apps now
 * authenticate with their OWN user tokens (see /v1/auth/mobile/login|signup) — the
 * old shared static MOBILE_API_KEY path has been removed, so every request is tied
 * to a real user + organization. (Name kept for compatibility with its consumers.)
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string | undefined>;
    const authorization = headers['authorization'];

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
      });
    }

    try {
      request['user'] = verifyAccessToken(authorization.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException({
        error: { code: 'TOKEN_INVALID', message: 'Access token is invalid or expired' },
      });
    }
  }
}
