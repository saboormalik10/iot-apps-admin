import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyAccessToken } from '../../utils/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const authHeader = request['headers'] as Record<string, string | undefined>;
    const authorization = authHeader['authorization'];

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header',
        },
      });
    }

    const token = authorization.slice(7);
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
