import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedService } from '../guards/service-credential.guard';

/**
 * Reads the machine identity attached by `ServiceCredentialGuard`.
 *
 * Deliberately a separate decorator from `@CurrentUser()`, reading a separate
 * request property: a service call has no user, and a user call has no service
 * credential. Keeping the two vocabularies apart means neither can be mistaken
 * for the other at a call site.
 */
export const CurrentService = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedService => {
    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    return request['serviceCredential'] as AuthenticatedService;
  },
);
