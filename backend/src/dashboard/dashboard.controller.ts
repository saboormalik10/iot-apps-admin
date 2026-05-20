import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({ summary: 'Organisation-wide summary counts' })
  @ApiOkResponse({ description: 'Device / record / session counts' })
  @Get('summary')
  @UseGuards(JwtAuthGuard)
  async getSummary(@CurrentUser() user: JWTPayload) {
    return this.dashboardService.getSummary(user.organizationId);
  }

  @ApiOperation({ summary: 'List all devices with online status' })
  @ApiOkResponse({ description: 'Device list with isOnline flag' })
  @Get('devices')
  @UseGuards(JwtAuthGuard)
  async getDevices(@CurrentUser() user: JWTPayload) {
    return this.dashboardService.getDevices(user.organizationId);
  }

  @ApiOperation({ summary: 'Latest MET-LINK sensor snapshot' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiOkResponse({ description: 'Full sensor snapshot from the latest record row' })
  @Get('met/latest')
  @UseGuards(JwtAuthGuard)
  async getMetLatest(
    @Query('deviceId') deviceId: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dashboardService.getMetLatest(user.organizationId, deviceId);
  }

  @ApiOperation({ summary: 'MET-LINK wind rose data (last 10 min and 2 min)' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiOkResponse({
    description:
      'Wind direction/speed arrays: last600 (≈10 min) and last120 (≈2 min)',
  })
  @Get('met/windrose')
  @UseGuards(JwtAuthGuard)
  async getMetWindrose(
    @Query('deviceId') deviceId: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dashboardService.getMetWindrose(user.organizationId, deviceId);
  }

  @ApiOperation({ summary: 'MET-LINK 1-minute aggregated sensor history' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiQuery({
    name: 'sensor',
    required: true,
    description:
      'Sensor key: wind_speed | wind_dir | temperature | humidity | pressure | solar | precipitation | dew_point | voltage',
  })
  @ApiQuery({ name: 'from', required: true, description: 'Start time (Unix ms)' })
  @ApiQuery({ name: 'to', required: true, description: 'End time (Unix ms)' })
  @ApiOkResponse({ description: '1-minute buckets: { sensor, unit, data: [{timestampMs, min, max, avg, count}] }' })
  @Get('met/history')
  @UseGuards(JwtAuthGuard)
  async getMetHistory(
    @Query('deviceId') deviceId: string,
    @Query('sensor') sensor: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dashboardService.getMetHistory(
      user.organizationId,
      deviceId,
      sensor,
      parseInt(from, 10),
      parseInt(to, 10),
    );
  }

  @ApiOperation({ summary: 'NEP-LINK sessions list' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Filter by device ObjectId' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
  @ApiOkResponse({ description: 'Paginated NEP-LINK session list' })
  @Get('nep/sessions')
  @UseGuards(JwtAuthGuard)
  async getNepSessions(
    @Query('deviceId') deviceId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dashboardService.getNepSessions(
      user.organizationId,
      deviceId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @ApiOperation({ summary: 'Latest NEP-LINK session + most recent sample snapshot' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiOkResponse({ description: 'Latest session summary and last sample reading' })
  @Get('nep/latest')
  @UseGuards(JwtAuthGuard)
  async getNepLatest(
    @Query('deviceId') deviceId: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dashboardService.getNepLatest(user.organizationId, deviceId);
  }

  @ApiOperation({ summary: 'NEP-LINK session trend (turbidity or temperature), downsampled to ≤500 pts' })
  @ApiQuery({ name: 'sessionId', required: true, description: 'NepSession UUID' })
  @ApiQuery({ name: 'field', required: false, description: 'turbidity (default) | temperature' })
  @ApiOkResponse({ description: '{ field, data: [{timestamp, value}] }' })
  @Get('nep/trend')
  @UseGuards(JwtAuthGuard)
  async getNepTrend(
    @Query('sessionId') sessionId: string,
    @Query('field') field: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dashboardService.getNepTrend(
      user.organizationId,
      sessionId,
      (field === 'temperature' ? 'temperature' : 'turbidity'),
    );
  }

  @ApiOperation({ summary: 'NEP-LINK GPS points with turbidity values, downsampled to ≤300 pts' })
  @ApiQuery({ name: 'sessionId', required: true, description: 'NepSession UUID' })
  @ApiOkResponse({ description: '{ sessionId, points: [{timestamp, lat, lng, turbidityValue, probeRange}] }' })
  @Get('nep/map')
  @UseGuards(JwtAuthGuard)
  async getNepMap(
    @Query('sessionId') sessionId: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dashboardService.getNepMap(user.organizationId, sessionId);
  }
}
