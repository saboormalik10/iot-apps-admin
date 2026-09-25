import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { DevicesService } from './devices.service';
import { UpdateDeviceDto } from './dto';

const DEVICE_EXAMPLE = {
  _id: '664a1f2e3c4d5e6f7a8b9c0f',
  organizationId: '664a1f2e3c4d5e6f7a8b9c0e',
  bleId: 'STANDALONE-8b9c0e',
  name: 'GMX551 Station',
  type: 'MET-LINK',
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
  @ApiQuery({ name: 'bleId', required: false, description: 'Filter by the station\'s fixed identifier' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
  @ApiOkResponse({
    description: 'Paginated device list',
    schema: { example: { data: [DEVICE_EXAMPLE], meta: { page: 1, limit: 20, total: 1, pages: 1 } } },
  })
  @ApiErrors('unauthorized')
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('device:read')
  async listDevices(
    @Query('type') type?: 'MET-LINK' | 'NEP-LINK',
    @Query('bleId') bleId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JWTPayload,
  ) {
    return this.devicesService.listDevices({
      organizationId: user!.organizationId,
      type,
      bleId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
    });
  }

  @ApiOperation({ summary: 'Get device detail + live status' })
  @ApiOkResponse({ description: 'Device detail', schema: { example: { data: DEVICE_EXAMPLE } } })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('device:read')
  async getDevice(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const device = await this.devicesService.getDevice(user!.organizationId, id);
    return { data: device };
  }

  @ApiOperation({ summary: 'Update the station: name, serial, rain day, heading offset, raw samples' })
  @ApiBody({ type: UpdateDeviceDto })
  @ApiOkResponse({ description: 'Updated device', schema: { example: { data: DEVICE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized', 'notFound')
  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('device:write')
  async updateDevice(
    @Param('id') id: string,
    @Body() body: UpdateDeviceDto,
    @CurrentUser() user?: JWTPayload,
    @ClientIp() ipAddress?: string | null,
  ) {
    const device = await this.devicesService.updateDevice(
      user!.organizationId,
      id,
      body,
      { userId: user!.userId, email: user!.email ?? '', ipAddress },
    );
    return { data: device };
  }

  @ApiOperation({ summary: 'Device health summary' })
  @ApiOkResponse({ description: 'Device health' })
  @ApiErrors('unauthorized', 'notFound')
  @Get(':id/health')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('device:read')
  async getDeviceHealth(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const health = await this.devicesService.getDeviceHealth(user!.organizationId, id);
    return { data: health };
  }
}
