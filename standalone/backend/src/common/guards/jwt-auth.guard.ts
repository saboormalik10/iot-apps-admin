import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { User } from '../../models/User';
import { verifyAccessToken, JWTPayload } from '../../utils/jwt';

/** What a user who must choose a new password may still reach. */
function isPasswordChangeCall(method: string, url: string): boolean {
  const path = url.split('?')[0].replace(/\/+$/, '');
  return path.endsWith('/users/me') && (method === 'PATCH' || method === 'GET');
}

/**
 * The bearer token, checked against the account as it is NOW.
 *
 * The token alone is not enough. It lives 15 minutes and carries its own grants,
 * so an account that has just been suspended, removed, or had its password reset
 * by an administrator kept working for the rest of that window — reads, writes and
 * exports — which is exactly the window those actions exist to close. One indexed
 * lookup per request buys: the account still exists and is active, the token was
 * minted after the last "end all sessions" moment, and a user who must choose a new
 * password can do nothing else until they have.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const headers = request['headers'] as Record<string, string | undefined>;
    const authorization = headers['authorization'];

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
      });
    }

    let payload: JWTPayload;
    try {
      payload = verifyAccessToken(authorization.slice(7));
    } catch {
      throw new UnauthorizedException({
        error: { code: 'TOKEN_INVALID', message: 'Access token is invalid or expired' },
      });
    }

    const refuse = (code: string, message: string) => {
      throw new UnauthorizedException({ error: { code, message } });
    };

    if (!Types.ObjectId.isValid(payload.userId)) refuse('TOKEN_INVALID', 'Access token is invalid or expired');
    const user = await User.findById(payload.userId)
      .select('isActive deletedAt mustChangePassword sessionsValidFrom')
      .lean();
    if (!user || user.deletedAt) refuse('ACCOUNT_GONE', 'This account no longer exists');
    if (!user!.isActive) refuse('ACCOUNT_SUSPENDED', 'This account is not active');
    // Seconds, like the token's `iat`: a token minted in the same second as the
    // reset is the NEW one and must keep working.
    if (user!.sessionsValidFrom && payload.iat && payload.iat < Math.floor(new Date(user!.sessionsValidFrom).getTime() / 1000)) {
      refuse('SESSION_ENDED', 'This session was ended. Sign in again.');
    }

    if (
      user!.mustChangePassword &&
      !isPasswordChangeCall(String(request['method'] ?? ''), String(request['url'] ?? ''))
    ) {
      throw new ForbiddenException({
        error: {
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Choose your own password before using the portal.',
        },
      });
    }

    request['user'] = payload;
    return true;
  }
}
