import { Controller, Get, Post, HttpCode, UseGuards, Query, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { SyncService, SyncUploadPayload } from './sync.service';

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
}

