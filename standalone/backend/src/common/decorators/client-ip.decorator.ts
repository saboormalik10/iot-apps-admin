import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * The address of the PC that made this request, for the audit log.
 *
 * The portal is the only thing that talks to the API, so every request arrives
 * from this machine; `web/server.mjs` stamps the browser's real address into
 * `X-Forwarded-For` (overwriting anything it sent) and the API trusts exactly one
 * hop. Without this, account changes — who was created, removed, approved, or had
 * their password reset — recorded no address at all, while sign-ins did.
 */
export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | null => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return forwarded || req.socket?.remoteAddress || null;
});
