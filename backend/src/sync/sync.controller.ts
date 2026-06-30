import { Controller, Get, Post, Patch, HttpCode, UseGuards, Query, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { SyncService, SyncUploadPayload, DeviceStatusInput } from './sync.service';
import { SyncUploadDto, DeviceStatusDto } from './dto';

@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @ApiOperation({ summary: 'Get sync status for the organisation' })
  @Get('status')
  @UseGuards(JwtOrApiKeyGuard)
  async getSyncStatus(
    @Query('deviceId') deviceId?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    const result = await this.syncService.getSyncStatus(user!.organizationId, deviceId);
    return { data: result };
  }

  @ApiOperation({ summary: 'Upload (upsert) a session or record from mobile' })
  @ApiBody({ type: SyncUploadDto })
  @Post('upload')
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  async syncUpload(
    @Body() body: SyncUploadPayload,
    @CurrentUser() user?: JWTPayload,
  ) {
    const result = await this.syncService.syncUpload(user!.organizationId, body);
    return { data: result };
  }

  @ApiOperation({ summary: 'Download sessions/records for a device' })
  @Get('download')
  @UseGuards(JwtOrApiKeyGuard)
  async syncDownload(
    @Query('deviceId') deviceId: string,
    @Query('since') since?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    const result = await this.syncService.syncDownload(
      user!.organizationId,
      deviceId,
      since ? Number(since) : undefined,
    );
    return { data: result };
  }

  @ApiOperation({ summary: 'Device heartbeat — update lastSeenAt + battery + firmware (mobile)' })
  @ApiBody({ type: DeviceStatusDto })
  @Patch('device-status')
  @UseGuards(JwtOrApiKeyGuard)
  async deviceStatus(
    @Body() body: DeviceStatusInput & { deviceId: string },
    @CurrentUser() user?: JWTPayload,
  ) {
    const { deviceId, ...rest } = body;
    const result = await this.syncService.updateDeviceStatus(user!.organizationId, deviceId, rest);
    return { data: result };
  }
}

