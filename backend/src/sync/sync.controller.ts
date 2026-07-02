import { Controller, Get, Post, Patch, HttpCode, UseGuards, Query, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Consumers } from '../common/decorators/consumers.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { SyncService, SyncUploadPayload, DeviceStatusInput } from './sync.service';
import { SyncUploadDto, DeviceStatusDto } from './dto';

@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @ApiOperation({
    summary: 'Get sync status for the organisation',
    description: 'Used by NEP-LINK app & MET-LINK app. Returns synced session/record counts and last-sync timestamps, optionally scoped to one device.',
  })
  @Consumers('nep-link', 'met-link')
  @ApiQuery({ name: 'deviceId', required: false, description: 'Device ObjectId — omit for org-wide totals' })
  @ApiOkResponse({
    description: 'Sync status',
    schema: {
      example: {
        data: {
          organizationId: '664a1f2e3c4d5e6f7a8b9c0e',
          deviceId: '664a1f2e3c4d5e6f7a8b9c0f',
          nepSessions: { total: 42, lastSyncedAt: '2026-06-23T10:00:00.000Z', lastSession: { id: '550e8400-e29b-41d4-a716-446655440000', deviceName: 'NEP-LINK-001', syncedAt: '2026-06-23T10:00:00.000Z', sampleCount: 3600 } },
          metRecords: { total: 17, lastSyncedAt: '2026-06-23T09:30:00.000Z', lastRecord: { deviceName: 'MET-LINK-001', dateStart: '2026-06-23 09:00:00', syncedAt: '2026-06-23T09:30:00.000Z', measureCount: 4401 } },
          serverTime: '2026-06-23T10:05:00.000Z',
        },
      },
    },
  })
  @ApiErrors('unauthorized')
  @Get('status')
  @UseGuards(JwtOrApiKeyGuard)
  async getSyncStatus(
    @Query('deviceId') deviceId?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    const result = await this.syncService.getSyncStatus(user!.organizationId, deviceId);
    return { data: result };
  }

  @ApiOperation({
    summary: 'Upload (upsert) a session or record from mobile',
    description:
      'Used by NEP-LINK app & MET-LINK app — the payload differs per app (see the **Examples** dropdown). Idempotent: NEP dedupes by `sessionId` UUID, MET by `localRecordId` (or `deviceId + dateStart`).',
  })
  @Consumers('nep-link', 'met-link')
  @ApiBody({
    type: SyncUploadDto,
    examples: {
      nepSession: {
        summary: '📱 NEP-LINK — nep_session',
        value: {
          type: 'nep_session',
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          deviceId: '664a1f2e3c4d5e6f7a8b9c0f',
          deviceName: 'NEP-LINK-001',
          startTimestamp: 1746057600000,
          endTimestamp: 1746061200000,
          timezoneName: 'Australia/Melbourne',
          timezoneOffset: 10,
          turbidityEnabled: true,
          temperatureEnabled: true,
          samples: [
            { timestamp: 1746057601000, turbidityValue: 245.5, temperatureValue: 18.4, probeRange: 'R2', batteryLevel: 85 },
          ],
        },
      },
      metRecord: {
        summary: '📱 MET-LINK — met_record',
        value: {
          type: 'met_record',
          deviceId: '664a1f2e3c4d5e6f7a8b9c0f',
          deviceName: 'MET-LINK-001',
          dateStart: '2026-05-01 14:00:00',
          dateEnd: '2026-05-01 15:00:00',
          localRecordId: 42,
          measures: [
            { dataSentence: 'Wind speed,Unit,Description,Temperature,Unit,Description', timeStamp: '2026-05-01 14:00:00' },
            { dataSentence: '12.5,m/s,relative,23.4,°C,TEMP', timeStamp: '2026-05-01 14:00:01' },
          ],
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Upserted session (NEP) or record (MET)',
    content: {
      'application/json': {
        examples: {
          nepSession: {
            summary: '📱 NEP-LINK response',
            value: { data: { type: 'nep_session', session: { id: '550e8400-e29b-41d4-a716-446655440000', sampleCount: 1, probeRange: 'R2' }, samplesInserted: 1 } },
          },
          metRecord: {
            summary: '📱 MET-LINK response',
            value: { data: { type: 'met_record', record: { _id: '664a1f2e3c4d5e6f7a8b9c20', localRecordId: 42, measureCount: 1 }, measuresInserted: 2 } },
          },
        },
      },
    },
  })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
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

  @ApiOperation({
    summary: 'Download sessions/records for a device',
    description: 'Used by NEP-LINK app & MET-LINK app. Cursor-based pull of everything synced since `since` (Unix ms). Returns `nepSessions` for NEP-LINK devices, `metRecords` for MET-LINK devices (≤100).',
  })
  @Consumers('nep-link', 'met-link')
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiQuery({ name: 'since', required: false, description: 'Unix ms cursor — only items synced at/after this time' })
  @ApiOkResponse({
    description: 'Device data since the cursor',
    schema: {
      example: {
        data: {
          device: { id: '664a1f2e3c4d5e6f7a8b9c0f', name: 'NEP-LINK-001', type: 'NEP-LINK' },
          since: '2026-06-23T00:00:00.000Z',
          nepSessions: [],
          metRecords: [],
        },
      },
    },
  })
  @ApiErrors('unauthorized', 'notFound')
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

  @ApiOperation({
    summary: 'Device heartbeat — update lastSeenAt + battery + firmware (mobile)',
    description: 'Used by NEP-LINK app & MET-LINK app. Call on BLE connect and ~every 60s while connected. `appType` distinguishes the caller; a firmware change appends a firmware-history entry.',
  })
  @Consumers('nep-link', 'met-link')
  @ApiBody({
    type: DeviceStatusDto,
    examples: {
      nepLink: {
        summary: '📱 NEP-LINK heartbeat',
        value: { deviceId: '664a1f2e3c4d5e6f7a8b9c0f', batteryPct: 85, batteryCharging: false, firmwareVersion: '2.1.0', appType: 'NEP-LINK' },
      },
      metLink: {
        summary: '📱 MET-LINK heartbeat',
        value: { deviceId: '664a1f2e3c4d5e6f7a8b9c0f', batteryPct: 82, batteryVoltage: 12.1, firmwareVersion: '1.4.0', appType: 'MET-LINK' },
      },
    },
  })
  @ApiOkResponse({
    description: 'Updated device status',
    schema: {
      example: { data: { deviceId: '664a1f2e3c4d5e6f7a8b9c0f', lastSeenAt: '2026-06-23T10:05:00.000Z', isOnline: true, firmwareVersion: '2.1.0', batteryPct: 85 } },
    },
  })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
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
