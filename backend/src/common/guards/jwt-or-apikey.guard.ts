import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyAccessToken, JWTPayload } from '../../utils/jwt';

/**
 * Accepts EITHER a valid JWT (admin panel / user) OR the static mobile API key.
 * When the mobile key is used, req.user is populated from MOBILE_ORG_ID env var.
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string | undefined>;
    const authorization = headers['authorization'];

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header',
        },
      });
    }

    const token = authorization.slice(7);
    const mobileKey = process.env.MOBILE_API_KEY;
    const mobileOrgId = process.env.MOBILE_ORG_ID;

    // Static mobile API key path
    if (mobileKey && token === mobileKey) {
      if (!mobileOrgId) {
        throw new InternalServerErrorException({
          error: { code: 'SERVER_ERROR', message: 'MOBILE_ORG_ID not configured' },
        });
      }
      request['user'] = {
        userId: 'mobile-device',
        organizationId: mobileOrgId,
        role: 'member',
      } as JWTPayload;
      return true;
    }

    // JWT path (admin panel)
    try {
      request['user'] = verifyAccessToken(token);
      return true;
    } catch {
      throw new UnauthorizedException({
        error: {
          code: 'TOKEN_INVALID',
          message: 'Access token is invalid or expired',
        },
      });
    }
  }
}
