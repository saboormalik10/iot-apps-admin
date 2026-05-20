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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { SessionsService, CreateSessionInput, BulkSampleInput } from './sessions.service';

@ApiTags('NEP Sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @ApiOperation({ summary: 'List sessions' })
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

  @ApiOperation({ summary: 'Upload a NEP-LINK session from the mobile app' })
  @Post()
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  async createSession(@Body() body: CreateSessionInput, @CurrentUser() user?: JWTPayload) {
    const session = await this.sessionsService.createSession(user!.organizationId, body);
    return { data: session };
  }

  @ApiOperation({ summary: 'Get session detail + aggregated stats' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getSession(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const session = await this.sessionsService.getSession(user!.organizationId, id);
    return { data: session };
  }

  @ApiOperation({ summary: 'Update session comment' })
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateSession(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @CurrentUser() user?: JWTPayload,
  ) {
    const session = await this.sessionsService.updateSession(user!.organizationId, id, body);
    return { data: session };
  }

  @ApiOperation({ summary: 'Delete session and cascade-delete all samples' })
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

  @ApiOperation({ summary: 'Bulk insert samples for a session' })
  @Post(':id/samples')
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  async bulkInsertSamples(
    @Param('id') id: string,
    @Body() body: { samples: BulkSampleInput[] },
    @CurrentUser() user?: JWTPayload,
  ) {
    const result = await this.sessionsService.bulkInsertSamples(
      user!.organizationId,
      id,
      body.samples,
    );
    return { data: result };
  }

  @ApiOperation({ summary: 'Get paginated samples for a session' })
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

  @ApiOperation({ summary: 'Export session as CSV' })
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
