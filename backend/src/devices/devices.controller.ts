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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { DevicesService } from './devices.service';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @ApiOperation({ summary: 'List all devices in org' })
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

  @ApiOperation({ summary: 'Register a new device' })
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

  @ApiOperation({ summary: 'Get device detail + live status' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getDevice(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const device = await this.devicesService.getDevice(user!.organizationId, id);
    return { data: device };
  }

  @ApiOperation({ summary: 'Update device name / serial / firmware' })
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
  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  async getDeviceStats(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const stats = await this.devicesService.getDeviceStats(user!.organizationId, id);
    return { data: stats };
  }
}
