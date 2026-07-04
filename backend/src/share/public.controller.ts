import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { PublicService } from './public.service';

/**
 * Unauthenticated public share view. No `@ApiBearerAuth` — "public" means no JWT
 * (the page is served by the same-origin dashboard SPA). Rate-limited explicitly
 * because `ThrottlerGuard` is not registered globally in this app.
 */
@ApiTags('Public')
@Controller('public')
@UseGuards(ThrottlerGuard)
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @ApiOperation({
    summary: 'Public read-only shared session/record (no login required)',
    description: 'Opens a link created via `POST /v1/share`. Rate-limited; returns 404 when the token is unknown, revoked or expired.',
  })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOkResponse({ description: 'Read-only snapshot of the shared resource' })
  @ApiErrors('notFound', 'tooManyRequests')
  @Get(':token')
  async getPublic(@Param('token') token: string) {
    const data = await this.publicService.getByToken(token);
    return { data };
  }
}
