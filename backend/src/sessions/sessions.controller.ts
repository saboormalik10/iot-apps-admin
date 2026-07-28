import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Consumers } from '../common/decorators/consumers.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { SessionsService } from './sessions.service';
import { CreateSessionDto, UpdateSessionDto, BulkSamplesDto } from './dto';

const SESSION_EXAMPLE = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  deviceId: '664a1f2e3c4d5e6f7a8b9c0f',
  deviceName: 'NEP-LINK-001',
  startTimestamp: 1746057600000,
  endTimestamp: 1746061200000,
  probeRange: 'R2',
  sampleCount: 1,
  syncedAt: '2026-06-23T10:00:00.000Z',
};

@ApiTags('NEP Sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @ApiOperation({ summary: 'List sessions (admin dashboard)' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Filter by device ObjectId' })
  @ApiQuery({ name: 'from', required: false, description: 'Unix ms — start of range' })
  @ApiQuery({ name: 'to', required: false, description: 'Unix ms — end of range' })
  @ApiQuery({ name: 'probeRange', required: false, enum: ['R1', 'R2', 'R3'] })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
  @ApiOkResponse({ description: 'Paginated sessions', schema: { example: { data: [SESSION_EXAMPLE], meta: { page: 1, limit: 20, total: 1, pages: 1 } } } })
  @ApiErrors('unauthorized')
  @Get()
  @UseGuards(JwtAuthGuard)
  async listSessions(
    @Query('deviceId') deviceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('probeRange') probeRange?: 'R1' | 'R2' | 'R3',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    return this.sessionsService.listSessions({
      organizationId: user!.organizationId,
      deviceId,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      probeRange,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
    });
  }

  @ApiOperation({
    summary: 'Upload a NEP-LINK session from the mobile app',
    description:
      '**Call this when a measuring session finishes (or to sync one recorded offline).**\n\n' +
      'Generate a UUID v4 on the phone and send it as `id` — if the upload is interrupted, retry ' +
      'with the SAME id and nothing is duplicated. Send the session\'s metadata here, then push its ' +
      'readings with `POST /v1/sessions/{id}/samples`. The session is saved with the logged-in ' +
      'user\'s id, so the admin panel shows who recorded it.',
  })
  @Consumers('nep-link')
  @ApiBody({
    type: CreateSessionDto,
    examples: {
      nepLink: {
        summary: '📱 NEP-LINK session',
        value: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          deviceId: '664a1f2e3c4d5e6f7a8b9c0f',
          deviceName: 'NEP-LINK-001',
          startTimestamp: 1746057600000,
          endTimestamp: 1746061200000,
          timezoneName: 'Australia/Melbourne',
          timezoneOffset: 10,
          turbidityEnabled: true,
          temperatureEnabled: true,
          comment: 'River sampling at intake',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Created session', schema: { example: { data: SESSION_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Post()
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  async createSession(@Body() body: CreateSessionDto, @CurrentUser() user?: JWTPayload) {
    const session = await this.sessionsService.createSession(user!.organizationId, body, user!.userId);
    return { data: session };
  }

  @ApiOperation({ summary: 'Get session detail + aggregated stats (admin dashboard)' })
  @ApiOkResponse({ description: 'Session detail', schema: { example: { data: SESSION_EXAMPLE } } })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getSession(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const session = await this.sessionsService.getSession(user!.organizationId, id);
    return { data: session };
  }

  @ApiOperation({
    summary: 'Update a NEP-LINK session (mobile + admin)',
    description:
      '**Call this when the user edits a session in your app** — e.g. adds a comment, or the session ' +
      'ends and you now know `endTimestamp`. Send only the fields that changed; everything else stays ' +
      'as it was. You cannot change who/what the session belongs to (`id`, `deviceId`, organisation) ' +
      'or the computed statistics — those are protected. Also used by the admin panel to edit comments.',
  })
  @Consumers('nep-link', 'admin')
  @ApiBody({
    type: UpdateSessionDto,
    examples: {
      nepLink: {
        summary: '📱 NEP-LINK session update',
        value: { comment: 'Re-sampled after rain', endTimestamp: 1746061200000, temperatureEnabled: false },
      },
      adminComment: {
        summary: '🖥️ Admin comment edit',
        value: { comment: 'Reviewed — values look nominal' },
      },
    },
  })
  @ApiOkResponse({ description: 'Updated session', schema: { example: { data: SESSION_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Patch(':id')
  @UseGuards(JwtOrApiKeyGuard)
  async updateSession(
    @Param('id') id: string,
    @Body() body: UpdateSessionDto,
    @CurrentUser() user?: JWTPayload,
  ) {
    const session = await this.sessionsService.updateSession(user!.organizationId, id, body);
    return { data: session };
  }

  @ApiOperation({ summary: 'Delete session and cascade-delete all samples (admin dashboard)' })
  @ApiNoContentResponse({ description: 'Session deleted' })
  @ApiErrors('unauthorized', 'notFound')
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteSession(@Param('id') id: string, @CurrentUser() user?: JWTPayload): Promise<void> {
    await this.sessionsService.deleteSession(
      user!.organizationId,
      id,
      { userId: user!.userId, email: user!.email ?? '' },
    );
  }

  @ApiOperation({
    summary: 'Bulk insert samples for a session',
    description:
      '**Call this right after uploading the session** to push its readings. `:id` is the session ' +
      'UUID you generated. Send up to **7200 samples per call** — for longer sessions, split into ' +
      'several calls. Include `locationLat`/`locationLng` when the phone has a GPS fix: those points ' +
      'draw the session on the map AND place the device on the admin panel\'s fleet map.',
  })
  @Consumers('nep-link')
  @ApiBody({
    type: BulkSamplesDto,
    examples: {
      nepLink: {
        summary: '📱 NEP-LINK samples',
        value: {
          samples: [
            { timestamp: 1746057601000, turbidityValue: 245.5, temperatureValue: 18.4, probeRange: 'R2', batteryLevel: 85 },
          ],
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Samples inserted', schema: { example: { data: { inserted: 1 } } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Post(':id/samples')
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  async bulkInsertSamples(
    @Param('id') id: string,
    @Body() body: BulkSamplesDto,
    @CurrentUser() user?: JWTPayload,
  ) {
    const result = await this.sessionsService.bulkInsertSamples(
      user!.organizationId,
      id,
      body.samples,
    );
    return { data: result };
  }

  @ApiOperation({ summary: 'Get paginated samples for a session (admin dashboard)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 500, max 1000)' })
  @ApiQuery({ name: 'downsample', required: false, description: 'Set "true" to downsample to ≤500 points for charts' })
  @ApiOkResponse({ description: 'Paginated samples' })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/samples')
  @UseGuards(JwtAuthGuard)
  async getSamples(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('downsample') downsample?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    return this.sessionsService.getSamples({
      organizationId: user!.organizationId,
      sessionId: id,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 1000) : 500,
      downsample: downsample === 'true',
    });
  }

  @ApiOperation({ summary: 'Export session as CSV (admin dashboard)' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV file download', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/export.csv')
  @UseGuards(JwtAuthGuard)
  async exportCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user?: JWTPayload,
  ): Promise<void> {
    const csv = await this.sessionsService.exportSessionCsv(user!.organizationId, id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="NEP-Link-${date}.csv"`);
    res.send(csv);
  }
}
