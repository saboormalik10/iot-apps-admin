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
import { SyncService } from './sync.service';
import { SyncUploadDto, DeviceStatusDto } from './dto';

@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @ApiOperation({
    summary: 'Get sync status for the organisation',
    description:
      '**Call this to show a "last synced" screen in your app.** Returns how many sessions/records ' +
      'are already in the cloud and when the last one arrived — org-wide, or for one device if you ' +
      'pass `deviceId`. Compare against your local database to decide what still needs uploading.',
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
      '**The one-shot upload: send a whole session/record WITH its readings in a single call** — ' +
      'the easiest way to sync. Set `type` to `nep_session` or `met_record`; the rest of the payload ' +
      'differs per app (see the **Examples** dropdown).\n\n' +
      'Safe to retry: if the connection drops, send the exact same payload again and nothing is ' +
      'duplicated (NEP matches on the `sessionId` UUID, MET on `localRecordId`). Everything is saved ' +
      'with the logged-in user\'s id, so the admin panel shows who synced it. For very large uploads ' +
      'prefer the split flow (`POST /v1/sessions` + samples, or `POST /v1/records` + measures).',
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
            { dataSentence: 'Wind speed,Unit,Description,Temperature,Unit,Description,Solar,Unit,Description,Latitude phone,Longitude phone', timeStamp: '2026-05-01 14:00:00' },
            { dataSentence: '12.5,m/s,relative,23.4,°C,TEMP,450,W/m²,SOLAR,31.5204,74.3587', timeStamp: '2026-05-01 14:00:01' },
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
    @Body() body: SyncUploadDto,
    @CurrentUser() user?: JWTPayload,
  ) {
    const result = await this.syncService.syncUpload(user!.organizationId, body, user!.userId);
    return { data: result };
  }

  @ApiOperation({
    summary: 'Download sessions/records for a device',
    description:
      '**Call this to pull cloud data back onto the phone** — e.g. after a re-install, or to show ' +
      'data uploaded from another phone. Pass the `deviceId` and (optionally) `since` = the last time ' +
      'you pulled (Unix ms). You get everything synced after that moment — sessions for NEP devices, ' +
      'records for MET devices, up to 100 at a time. Save the newest `syncedAt` you receive and use ' +
      'it as the next `since`.',
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
    description:
      '**Call this when the app connects to the instrument over Bluetooth, then about once a minute ' +
      'while connected.** It is what makes the device show as **Online** on the admin dashboard ' +
      '(a device with no heartbeat in 5 minutes shows Offline). Include the battery level and ' +
      'firmware version if you have them — the dashboard displays both, and a firmware change is ' +
      'recorded in the device\'s history. Send `appType` ("MET-LINK" or "NEP-LINK") so the server ' +
      'knows which app reported it.',
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
    @Body() body: DeviceStatusDto,
    @CurrentUser() user?: JWTPayload,
  ) {
    const { deviceId, ...rest } = body;
    const result = await this.syncService.updateDeviceStatus(user!.organizationId, deviceId, rest, user!.userId);
    return { data: result };
  }
}
