import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';

/**
 * Standard error responses for Swagger. Every error the API returns uses the
 * envelope `{ error: { code, message } }` (see `AllExceptionsFilter`).
 *
 * Usage:
 *   @ApiErrors('unauthorized', 'notFound')          // typical protected read
 *   @ApiErrors('badRequest', 'unauthorized', 'forbidden')  // admin write
 *   @ApiErrors('unsupportedMediaType')              // file upload
 */
export type ApiErrorKind =
  | 'badRequest'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'unsupportedMediaType'
  | 'tooManyRequests';

const envelope = (code: string, message: string) => ({
  schema: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', example: code },
          message: { type: 'string', example: message },
        },
      },
    },
    example: { error: { code, message } },
  },
});

const MAP: Record<ApiErrorKind, () => MethodDecorator & ClassDecorator> = {
  badRequest: () =>
    ApiBadRequestResponse({
      description: 'Validation error — missing or invalid fields',
      ...envelope('VALIDATION_ERROR', 'email and password are required'),
    }),
  unauthorized: () =>
    ApiUnauthorizedResponse({
      description: 'Missing or invalid access token / API key',
      ...envelope('UNAUTHORIZED', 'Missing or invalid Authorization header'),
    }),
  forbidden: () =>
    ApiForbiddenResponse({
      description: 'Insufficient role / permissions',
      ...envelope('FORBIDDEN', 'Requires role: admin'),
    }),
  notFound: () =>
    ApiNotFoundResponse({
      description: 'Resource not found',
      ...envelope('NOT_FOUND', 'Device not found'),
    }),
  conflict: () =>
    ApiConflictResponse({
      description:
        'The resource already exists and belongs to someone else — retrying will not help. ' +
        'Distinct from 404: the id IS taken, just not by you.',
      ...envelope('SESSION_ID_CONFLICT', 'Session id already exists'),
    }),
  unsupportedMediaType: () =>
    ApiUnsupportedMediaTypeResponse({
      description: 'File type not allowed (validated by magic bytes)',
      ...envelope('INVALID_MIME', 'Unsupported file type: application/x-msdownload'),
    }),
  tooManyRequests: () =>
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded',
      ...envelope('TOO_MANY_REQUESTS', 'ThrottlerException: Too Many Requests'),
    }),
};

export function ApiErrors(...kinds: ApiErrorKind[]) {
  return applyDecorators(...kinds.map((k) => MAP[k]()));
}
