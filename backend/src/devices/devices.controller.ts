import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Consumers } from '../common/decorators/consumers.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { DevicesService } from './devices.service';
import { CreateDeviceDto, UpdateDeviceDto, UpdateDeviceSettingsDto, FirmwareTargetDto } from './dto';

const DEVICE_EXAMPLE = {
  _id: '664a1f2e3c4d5e6f7a8b9c0f',
  organizationId: '664a1f2e3c4d5e6f7a8b9c0e',
  bleId: 'NEP-LINK-001',
  name: 'River Intake Probe',
  type: 'NEP-LINK',
  firmwareVersion: '2.1.0',
  isOnline: false,
  createdAt: '2026-06-23T09:00:00.000Z',
};

@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @ApiOperation({ summary: 'List all devices in org' })
  @ApiQuery({ name: 'type', required: false, enum: ['MET-LINK', 'NEP-LINK'], description: 'Filter by device type' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
  @ApiOkResponse({
    description: 'Paginated device list',
    schema: { example: { data: [DEVICE_EXAMPLE], meta: { page: 1, limit: 20, total: 1, pages: 1 } } },
  })
  @ApiErrors('unauthorized')
  @Get()
  @UseGuards(JwtAuthGuard)
  async listDevices(
    @Query('type') type?: 'MET-LINK' | 'NEP-LINK',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    return this.devicesService.listDevices({
      organizationId: user!.organizationId,
      type,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
    });
  }

  @ApiOperation({
    summary: 'Register a new device',
    description: 'Used by NEP-LINK app & MET-LINK app on first pairing — the only difference is `type` (see the **Examples** dropdown). Save the returned `_id` as `deviceId`.',
  })
  @Consumers('nep-link', 'met-link')
  @ApiBody({
    type: CreateDeviceDto,
    examples: {
      nepLinkDevice: {
        summary: '📱 NEP-LINK device',
        value: { bleId: 'NEP-LINK-001', name: 'River Intake Probe', type: 'NEP-LINK', firmwareVersion: '2.1.0' },
      },
      metLinkDevice: {
        summary: '📱 MET-LINK device',
        value: { bleId: 'MET-LINK-001', name: 'Weather Station Roof', type: 'MET-LINK', firmwareVersion: '1.4.0' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Registered device', schema: { example: { data: DEVICE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized')
  @Post()
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  async createDevice(
    @Body() body: { bleId: string; name: string; type: 'MET-LINK' | 'NEP-LINK'; serialNo?: string; firmwareVersion?: string; customName?: string },
    @CurrentUser() user?: JWTPayload,
  ) {
    const device = await this.devicesService.createDevice(
      user!.organizationId,
      body,
      { userId: user!.userId, email: user!.email ?? '' },
    );
    return { data: device };
  }

  // ── Firmware version tracking (Month 6) — literal routes before :id ────────

  @ApiOperation({ summary: 'Set the org firmware target for a device type (admin)' })
  @ApiBody({ type: FirmwareTargetDto })
  @ApiOkResponse({ description: 'Updated firmware target', schema: { example: { data: { deviceType: 'NEP-LINK', version: '2.2.0' } } } })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden')
  @Put('firmware-target')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async setFirmwareTarget(@Body() body: FirmwareTargetDto, @CurrentUser() user: JWTPayload) {
    const data = await this.devicesService.setFirmwareTarget(user.organizationId, body, {
      userId: user.userId,
      email: user.email ?? '',
    });
    return { data };
  }

  @ApiOperation({ summary: 'List org firmware targets' })
  @ApiOkResponse({ description: 'Configured firmware targets', schema: { example: { data: [{ deviceType: 'NEP-LINK', version: '2.2.0' }] } } })
  @ApiErrors('unauthorized')
  @Get('firmware-target')
  @UseGuards(JwtAuthGuard)
  async listFirmwareTargets(@CurrentUser() user: JWTPayload) {
    const data = await this.devicesService.listFirmwareTargets(user.organizationId);
    return { data };
  }

  @ApiOperation({ summary: 'Firmware status per device (flags devices on outdated firmware)' })
  @ApiQuery({ name: 'type', required: false, enum: ['MET-LINK', 'NEP-LINK'] })
  @ApiOkResponse({
    description: 'Per-device firmware status',
    schema: { example: { data: [{ deviceId: '664a1f2e3c4d5e6f7a8b9c0f', name: 'River Intake Probe', type: 'NEP-LINK', firmwareVersion: '2.1.0', target: '2.2.0', targetSource: 'configured', outdated: true }], meta: { total: 1, outdated: 1 } } },
  })
  @ApiErrors('unauthorized')
  @Get('firmware-status')
  @UseGuards(JwtAuthGuard)
  async getFirmwareStatus(@Query('type') type: 'MET-LINK' | 'NEP-LINK', @CurrentUser() user: JWTPayload) {
    return this.devicesService.getFirmwareStatus(user.organizationId, type);
  }

  @ApiOperation({ summary: 'Get device detail + live status' })
  @ApiOkResponse({ description: 'Device detail', schema: { example: { data: DEVICE_EXAMPLE } } })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getDevice(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const device = await this.devicesService.getDevice(user!.organizationId, id);
    return { data: device };
  }

  @ApiOperation({ summary: 'Update device name / serial / firmware' })
  @ApiBody({ type: UpdateDeviceDto })
  @ApiOkResponse({ description: 'Updated device', schema: { example: { data: DEVICE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateDevice(
    @Param('id') id: string,
    @Body() body: { name?: string; customName?: string; serialNo?: string; firmwareVersion?: string },
    @CurrentUser() user?: JWTPayload,
  ) {
    const device = await this.devicesService.updateDevice(
      user!.organizationId,
      id,
      body,
      { userId: user!.userId, email: user!.email ?? '' },
    );
    return { data: device };
  }

  @ApiOperation({ summary: 'Soft-delete a device (admin only)' })
  @ApiNoContentResponse({ description: 'Device soft-deleted' })
  @ApiErrors('unauthorized', 'forbidden', 'notFound')
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteDevice(@Param('id') id: string, @CurrentUser() user?: JWTPayload): Promise<void> {
    await this.devicesService.deleteDevice(
      user!.organizationId,
      id,
      { userId: user!.userId, email: user!.email ?? '' },
    );
  }

  @ApiOperation({ summary: 'Aggregated stats for a device' })
  @ApiOkResponse({ description: 'Device stats' })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  async getDeviceStats(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const stats = await this.devicesService.getDeviceStats(user!.organizationId, id);
    return { data: stats };
  }

  @ApiOperation({ summary: 'Device health summary' })
  @ApiOkResponse({ description: 'Device health' })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/health')
  @UseGuards(JwtAuthGuard)
  async getDeviceHealth(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const health = await this.devicesService.getDeviceHealth(user!.organizationId, id);
    return { data: health };
  }

  @ApiOperation({ summary: 'Firmware version history timeline for a device' })
  @ApiOkResponse({ description: 'Firmware history' })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/firmware-history')
  @UseGuards(JwtAuthGuard)
  async getFirmwareHistory(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const result = await this.devicesService.getFirmwareHistory(user!.organizationId, id);
    return { data: result };
  }

  @ApiOperation({ summary: 'Get per-device configuration (settings) — admin dashboard' })
  @ApiOkResponse({ description: 'Device settings (defaults created on first read)' })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/settings')
  @UseGuards(JwtAuthGuard)
  async getDeviceSettings(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const settings = await this.devicesService.getDeviceSettings(user!.organizationId, id);
    return { data: settings };
  }

  @ApiOperation({
    summary: 'Update per-device configuration (partial; mobile + admin)',
    description: 'Used by MET-LINK app (and optionally NEP-LINK) **and** the admin dashboard. Send only the keys that changed.',
  })
  @Consumers('nep-link', 'met-link', 'admin')
  @ApiBody({
    type: UpdateDeviceSettingsDto,
    examples: {
      metLink: {
        summary: '📱 MET-LINK — units / wind-rose',
        value: { unitWindSpeed: 'km/h', unitPressure: 'hPa', unitTemperature: '°C', windRoseUnit: '1', windRosePeriod: '2', colorScheme: 2, dewPointEnabled: true },
      },
      nepLink: {
        summary: '📱 NEP-LINK — capture toggles',
        value: { qqEnabled: true, graphicalType: 'line', graphItem: 0 },
      },
    },
  })
  @ApiOkResponse({ description: 'Updated settings', schema: { example: { data: { deviceId: '664a1f2e3c4d5e6f7a8b9c0f', unitWindSpeed: 'km/h', unitPressure: 'hPa' } } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Patch(':id/settings')
  @UseGuards(JwtOrApiKeyGuard)
  async updateDeviceSettings(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user?: JWTPayload,
  ) {
    const settings = await this.devicesService.updateDeviceSettings(
      user!.organizationId,
      id,
      body,
      { userId: user!.userId, email: user!.email ?? '' },
    );
    return { data: settings };
  }
}
