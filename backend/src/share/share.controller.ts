import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { ShareService } from './share.service';
import { CreateShareDto } from './dto';

const SHARE_EXAMPLE = {
  _id: '664a1f2e3c4d5e6f7a8b9c70',
  token: 'shr_ab12cd34ef56',
  url: 'https://dashboard.observator.com/public/shr_ab12cd34ef56',
  resourceType: 'nepSession',
  resourceId: '550e8400-e29b-41d4-a716-446655440000',
  expiresAt: '2026-08-02T09:00:00.000Z',
  createdAt: '2026-07-03T09:00:00.000Z',
};

@ApiTags('Share')
@ApiBearerAuth()
@Controller('share')
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @ApiOperation({
    summary: 'Create a public share link for a NEP session or MET record',
    description: 'Returns an unauthenticated URL served at `/v1/public/:token`. Expires in 30 days unless `expiresAt` is provided.',
  })
  @ApiBody({ type: CreateShareDto })
  @ApiCreatedResponse({ description: 'Share link created', schema: { example: { data: SHARE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  async create(@Body() body: CreateShareDto, @CurrentUser() user: JWTPayload) {
    const data = await this.shareService.createShare(user.organizationId, body, {
      userId: user.userId,
      email: user.email ?? '',
    });
    return { data };
  }

  @ApiOperation({ summary: 'List share links in the org' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
  @ApiOkResponse({
    description: 'Paginated share links',
    schema: { example: { data: [SHARE_EXAMPLE], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } },
  })
  @ApiErrors('unauthorized')
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Query('page') page: string, @Query('limit') limit: string, @CurrentUser() user: JWTPayload) {
    return this.shareService.listShares(
      user.organizationId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @ApiOperation({ summary: 'Revoke a share link' })
  @ApiNoContentResponse({ description: 'Share revoked' })
  @ApiErrors('unauthorized', 'notFound')
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async revoke(@Param('id') id: string, @CurrentUser() user: JWTPayload): Promise<void> {
    await this.shareService.revokeShare(user.organizationId, id, { userId: user.userId, email: user.email ?? '' });
  }
}
