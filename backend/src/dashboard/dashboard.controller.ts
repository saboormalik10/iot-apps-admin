import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@ApiErrors('unauthorized', 'notFound')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @ApiOperation({ summary: 'Organisation-wide summary counts' })
  @ApiOkResponse({
    description:
      'Device / record / session counts, plus the active (armed) alert-rule count and ' +
      'last-14-day daily-count sparklines ({ records[], sessions[] }) for the dashboard KPI tiles.',
  })
  @ApiQuery({ name: 'type', required: false, description: 'MET-LINK | NEP-LINK — narrow every count to one device family' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Device ObjectId — narrow every count to one device' })
  @Get('summary')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async getSummary(
    @Query('type') type: string,
    @Query('deviceId') deviceId: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dashboardService.getSummary(
      user.organizationId,
      type === 'MET-LINK' || type === 'NEP-LINK' ? type : undefined,
      deviceId || undefined,
    );
  }

  @ApiOperation({ summary: 'List all devices with online status' })
  @ApiOkResponse({ description: 'Device list with isOnline flag' })
  @Get('devices')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async getDevices(@CurrentUser() user: JWTPayload) {
    return this.dashboardService.getDevices(user.organizationId);
  }

  @ApiOperation({ summary: 'Latest MET-LINK sensor snapshot' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiOkResponse({ description: 'Full sensor snapshot from the latest record row' })
  @Get('met/latest')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async getMetLatest(@Query('deviceId') deviceId: string, @CurrentUser() user: JWTPayload) {
    return this.dashboardService.getMetLatest(user.organizationId, deviceId);
  }

  @ApiOperation({ summary: 'MET-LINK wind rose data (last 10 min and 2 min)' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiOkResponse({
    description:
      'Wind direction/speed arrays: last600 (≈10 min) and last120 (≈2 min)',
  })
  @Get('met/windrose')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
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

  @ApiOperation({ summary: 'MET-LINK adaptive-bucket history for many sensors in one request' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiQuery({
    name: 'sensors',
    required: true,
    description:
      'Comma-separated sensor keys: wind_speed,temperature,humidity,pressure,dew_point,solar,precipitation,voltage',
  })
  @ApiQuery({ name: 'from', required: true, description: 'Start time (Unix ms)' })
  @ApiQuery({ name: 'to', required: true, description: 'End time (Unix ms)' })
  @ApiOkResponse({
    description:
      'Adaptive buckets for every requested sensor in one payload: ' +
      '{ from, to, bucketMs, series: { [sensor]: { unit, data: [{timestampMs, min, max, avg, count}] } } }',
  })
  @Get('met/history-multi')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async getMetHistoryMulti(
    @Query('deviceId') deviceId: string,
    @Query('sensors') sensors: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JWTPayload,
  ) {
    const list = (sensors ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.dashboardService.getMetHistoryMulti(
      user.organizationId,
      deviceId,
      list,
      parseInt(from, 10),
      parseInt(to, 10),
    );
  }
  /* ─────────────────────────────────────────────────────────────────────────
   * NEP DASHBOARD TILES — SWITCHED OFF (M15 W4)
   *
   * DashboardController stays registered — it serves the MET surface the station
   * actually feeds. Only the NEP tiles are disabled.
   * ───────────────────────────────────────────────────────────────────────── */


// // // //   @ApiOperation({ summary: 'NEP-LINK sessions list (filter/search by date, device, probe range)' })
// // // //   @ApiQuery({ name: 'deviceId', required: false, description: 'Filter by device ObjectId' })
// // // //   @ApiQuery({ name: 'from', required: false, description: 'startTimestamp lower bound (Unix ms)' })
// // // //   @ApiQuery({ name: 'to', required: false, description: 'startTimestamp upper bound (Unix ms)' })
// // // //   @ApiQuery({ name: 'probeRange', required: false, description: 'R1 | R2 | R3' })
// // // //   @ApiQuery({ name: 'search', required: false, description: 'Match deviceName or comment' })
// // // //   @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
// // // //   @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 20, max 100)' })
// // // //   @ApiOkResponse({ description: 'Paginated NEP-LINK session list' })
// // // //   @Get('nep/sessions')
// // // //   @UseGuards(JwtAuthGuard)
// // // //   async getNepSessions(
// // // //     @Query('deviceId') deviceId: string,
// // // //     @Query('from') from: string,
// // // //     @Query('to') to: string,
// // // //     @Query('probeRange') probeRange: string,
// // // //     @Query('search') search: string,
// // // //     @Query('page') page: string,
// // // //     @Query('limit') limit: string,
// // // //     @CurrentUser() user: JWTPayload,
// // // //   ) {
// // // //     return this.dashboardService.getNepSessions(
// // // //       user.organizationId,
// // // //       deviceId,
// // // //       page ? parseInt(page, 10) : 1,
// // // //       limit ? parseInt(limit, 10) : 20,
// // // //       {
// // // //         from: from ? parseInt(from, 10) : undefined,
// // // //         to: to ? parseInt(to, 10) : undefined,
// // // //         probeRange: probeRange || undefined,
// // // //         search: search || undefined,
// // // //       },
// // // //     );
// // // //   }
// // //
// // //   @ApiOperation({ summary: 'Latest NEP-LINK session + most recent sample snapshot' })
// // //   @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
// // //   @ApiOkResponse({ description: 'Latest session summary and last sample reading' })
// // //   @Get('nep/latest')
// // //   @UseGuards(JwtAuthGuard)
// // //   async getNepLatest(
// // //     @Query('deviceId') deviceId: string,
// // //     @CurrentUser() user: JWTPayload,
// // //   ) {
// // //     return this.dashboardService.getNepLatest(user.organizationId, deviceId);
// // //   }
// //
// //   @ApiOperation({ summary: 'NEP-LINK session trend (turbidity or temperature), downsampled to ≤500 pts' })
// //   @ApiQuery({ name: 'sessionId', required: true, description: 'NepSession UUID' })
// //   @ApiQuery({ name: 'field', required: false, description: 'turbidity (default) | temperature' })
// //   @ApiOkResponse({ description: '{ field, data: [{timestamp, value}] }' })
// //   @Get('nep/trend')
// //   @UseGuards(JwtAuthGuard)
// //   async getNepTrend(
// //     @Query('sessionId') sessionId: string,
// //     @Query('field') field: string,
// //     @CurrentUser() user: JWTPayload,
// //   ) {
// //     return this.dashboardService.getNepTrend(
// //       user.organizationId,
// //       sessionId,
// //       (field === 'temperature' ? 'temperature' : 'turbidity'),
// //     );
// //   }
//
//   @ApiOperation({ summary: 'NEP-LINK GPS points with turbidity values, downsampled to ≤300 pts' })
//   @ApiQuery({ name: 'sessionId', required: true, description: 'NepSession UUID' })
//   @ApiOkResponse({ description: '{ sessionId, points: [{timestamp, lat, lng, turbidityValue, probeRange}] }' })
//   @Get('nep/map')
//   @UseGuards(JwtAuthGuard)
//   async getNepMap(
//     @Query('sessionId') sessionId: string,
//     @CurrentUser() user: JWTPayload,
//   ) {
//     return this.dashboardService.getNepMap(user.organizationId, sessionId);
//   }

  @ApiOperation({ summary: 'MET-LINK lifetime aggregate stats for a device' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
  @ApiOkResponse({ description: 'Lifetime totals + min/max sensor extremes' })
  @Get('met/stats')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async getMetStats(@Query('deviceId') deviceId: string, @CurrentUser() user: JWTPayload) {
    return this.dashboardService.getMetStats(user.organizationId, deviceId);
  }

//   @ApiOperation({ summary: 'NEP-LINK cross-session daily turbidity trend' })
//   @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId' })
//   @ApiQuery({ name: 'from', required: false, description: 'Start time (Unix ms, default 30d ago)' })
//   @ApiQuery({ name: 'to', required: false, description: 'End time (Unix ms, default now)' })
//   @ApiOkResponse({ description: '[{ date, avgTurbidity, maxTurbidity, minTurbidity, sessionCount, totalSamples }]' })
//   @Get('nep/analytics')
//   @UseGuards(JwtAuthGuard)
//   async getNepAnalytics(
//     @Query('deviceId') deviceId: string,
//     @Query('from') from: string,
//     @Query('to') to: string,
//     @CurrentUser() user: JWTPayload,
//   ) {
//     return this.dashboardService.getNepAnalytics(
//       user.organizationId,
//       deviceId,
//       from ? parseInt(from, 10) : undefined,
//       to ? parseInt(to, 10) : undefined,
//     );
//   }

  @ApiOperation({ summary: 'Org fleet map — last-known GPS for every device' })
  @ApiOkResponse({ description: 'Devices with last GPS position, battery and online flag' })
  @Get('org/device-map')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('data:read')
  async getOrgDeviceMap(@CurrentUser() user: JWTPayload) {
    return this.dashboardService.getOrgDeviceMap(user.organizationId);
  }
}
