import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JWTPayload } from '../../utils/jwt';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JWTPayload => {
    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    return request['user'] as JWTPayload;
  },
);
