import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { SystemStatusService } from './system-status.service';
import { isMasterAdmin } from './master-admin';
import { StreamService } from '../stream/stream.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import type { JWTPayload } from '../utils/jwt';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

// NOTE: these two endpoints bypass the global `v1` prefix (see main.ts), so they
// are served at the domain ROOT (`/health`, `/version`) — NOT under `/v1`. The
// Swagger server is `/v1`, so use the absolute root URL in "Try it out".
@ApiTags('System')
@Controller()
export class SystemController {
  // Inject the Nest-managed Mongoose connection (the top-level `mongoose.connection`
  // default connection is not the one @nestjs/mongoose actually connects).
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly system: SystemStatusService,
    private readonly stream: StreamService,
  ) {}

  private actor(user: JWTPayload | undefined, ipAddress?: string | null) {
    return { userId: user!.userId, email: user!.email ?? '', organizationId: user!.organizationId, ipAddress };
  }

  private async assertMaster(user: JWTPayload | undefined): Promise<void> {
    if (!(await isMasterAdmin(user!.userId, user!.organizationId))) {
      throw Object.assign(new Error('Only the master administrator can stop or start the weather station.'), {
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    }
  }

  private stationState(allowed: boolean) {
    const s = this.stream.getStatus();
    return { allowed, running: !s.stopped, stopped: s.stopped };
  }

  @ApiOperation({
    summary: 'The weather station: running or stopped, and who may change it',
    description:
      "Whether the weather station is running (connected to its sensor and recording) or was stopped from the " +
      "portal, and whether the signed-in user may stop and start it - the master administrator (the site's first " +
      'active administrator) only.',
  })
  @ApiBearerAuth()
  @ApiErrors('unauthorized', 'forbidden')
  @Get('system/station')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system:read')
  async station(@CurrentUser() user?: JWTPayload) {
    return { data: this.stationState(await isMasterAdmin(user!.userId, user!.organizationId)) };
  }

  @ApiOperation({
    summary: 'Stop the weather station',
    description:
      'Master administrator only. Closes the sensor connection and stops recording; the portal stays up so it ' +
      'can be started again. Stays stopped across a restart until started.',
  })
  @ApiBearerAuth()
  @ApiErrors('unauthorized', 'forbidden')
  @Post('system/station/stop')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system:read')
  async stopStation(@CurrentUser() user?: JWTPayload, @ClientIp() ipAddress?: string | null) {
    await this.assertMaster(user);
    await this.stream.stopStation(this.actor(user, ipAddress));
    return { data: this.stationState(true) };
  }

  @ApiOperation({ summary: 'Start the weather station again', description: 'Master administrator only.' })
  @ApiBearerAuth()
  @ApiErrors('unauthorized', 'forbidden')
  @Post('system/station/start')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system:read')
  async startStation(@CurrentUser() user?: JWTPayload, @ClientIp() ipAddress?: string | null) {
    await this.assertMaster(user);
    await this.stream.startStation(this.actor(user, ipAddress));
    return { data: this.stationState(true) };
  }

  @ApiOperation({ summary: 'Health check', description: 'Returns server and database status. **Served at the root path `/health`** (not under `/v1`).' })
  @ApiOkResponse({ description: 'Server is healthy', schema: { example: { status: 'ok', db: 'connected', uptime: 3600, timestamp: '2026-06-23T10:00:00.000Z' } } })
  @Get('health')
  health(): Record<string, unknown> {
    return {
      status: 'ok',
      db: this.connection.readyState === 1 ? 'connected' : 'disconnected',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      // For status.cmd. The API listens on this PC only, and the portal never
      // forwards /health, so this is not visible on the network.
      stream: this.system.streamSummary(),
    };
  }

  @ApiOperation({
    summary: "The site PC's health",
    description:
      'The sensor connection, the database, free disk space, the last backup, and warnings (sensor ' +
      'quiet, disk low, backup failed or late, clock gone back). Backs the portal\'s System page.',
  })
  @ApiBearerAuth()
  @ApiErrors('unauthorized', 'forbidden')
  @Get('system/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system:read')
  async systemStatus() {
    return { data: await this.system.status() };
  }

  @ApiOperation({ summary: 'API version info', description: '**Served at the root path `/version`** (not under `/v1`).' })
  @ApiOkResponse({ description: 'Version info', schema: { example: { version: '1.0.0', env: 'production' } } })
  @Get('version')
  version(): Record<string, unknown> {
    return { version: this.system.version(), env: process.env.NODE_ENV ?? 'development' };
  }
}
