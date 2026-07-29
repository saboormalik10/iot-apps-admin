import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { parseDemoOnly } from '../utils/demo-scope.util';
import { AnalyticsService } from './analytics.service';
import { DailySummaryService } from './daily-summary.service';
import { MET_SENSOR_FIELD } from './analytics.util';

/** Swagger doc string — the accepted MET sensor keys (source of truth: MET_SENSOR_FIELD). */
const VALID_MET_SENSORS = `Valid: ${Object.keys(MET_SENSOR_FIELD).join(', ')}`;

/** Normalise a query param that may be a single string or an array into string[]. */
function toArray(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

@ApiTags('Analytics')
@ApiBearerAuth()
@ApiOkResponse({ description: 'Analytics result (shape varies per endpoint; wrapped in `{ data }` unless a CSV/JSON export)' })
@ApiErrors('badRequest', 'unauthorized', 'notFound')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly dailySummary: DailySummaryService,
  ) {}

  // ── MET-LINK ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'MET wind rose — 16 compass sectors × 5 speed bands' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'from', required: false, description: 'Unix ms (default: 24h ago)' })
  @ApiQuery({ name: 'to', required: false, description: 'Unix ms (default: now)' })
  @ApiQuery({ name: 'period', required: false, description: 'instant | 2min | 10min' })
  @ApiQuery({ name: 'unit', required: false, description: 'm/s | km/h | knots' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('met/wind-rose')
  metWindRose(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('period') period: string,
    @Query('unit') unit: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.metWindRose(user.organizationId, deviceId, from, to, period ?? 'instant', unit ?? 'm/s', {
      demoOnly: parseDemoOnly(demo),
    });
  }

  @ApiOperation({ summary: 'MET multi-sensor overlay (up to 5) on one aligned axis' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'sensors', required: true, description: `Repeatable: sensors[]=wind_speed&sensors[]=temperature. ${VALID_MET_SENSORS}` })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'interval', required: false, description: '1min | 5min | 1h' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('met/multi-sensor')
  metMultiSensor(
    @Query('deviceId') deviceId: string,
    @Query('sensors') sensors: string | string[],
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('interval') interval: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.metMultiSensor(user.organizationId, deviceId, toArray(sensors), from, to, interval ?? '1min', {
      demoOnly: parseDemoOnly(demo),
    });
  }

  @ApiOperation({ summary: 'MET full statistical profile for a sensor (+ Beaufort for wind_speed)' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'sensor', required: true, description: VALID_MET_SENSORS })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('met/statistics')
  metStatistics(
    @Query('deviceId') deviceId: string,
    @Query('sensor') sensor: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.metStatistics(user.organizationId, deviceId, sensor, from, to, { demoOnly: parseDemoOnly(demo) });
  }

  @ApiOperation({ summary: 'MET wind gust history (max wind per bucket)' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'interval', required: false, description: '1h | 4h | 1d' })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('met/wind-gust-history')
  metWindGust(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('interval') interval: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.metWindGust(user.organizationId, deviceId, from, to, interval ?? '1h', { demoOnly: parseDemoOnly(demo) });
  }

  @ApiOperation({ summary: 'MET comfort indices — heat index + wind chill time series' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'interval', required: false, description: '5min | 1h' })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('met/comfort-indices')
  metComfort(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('interval') interval: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.metComfort(user.organizationId, deviceId, from, to, interval ?? '1h', { demoOnly: parseDemoOnly(demo) });
  }

  @ApiOperation({ summary: 'MET fog risk — dew point spread time series' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'interval', required: false, description: 'Bucket size, e.g. 5min | 1h | 1d' })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('met/fog-risk')
  metFogRisk(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('interval') interval: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.metFogRisk(user.organizationId, deviceId, from, to, interval ?? '1h', { demoOnly: parseDemoOnly(demo) });
  }

  @ApiOperation({ summary: 'MET pressure tendency widget' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'hours', required: false, description: '3 | 6 | 12 | 24 (default 3)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('met/pressure-tendency')
  metPressureTendency(
    @Query('deviceId') deviceId: string,
    @Query('hours') hours: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.metPressureTendency(user.organizationId, deviceId, hours ? parseInt(hours, 10) : 3, { demoOnly: parseDemoOnly(demo) });
  }

  // ── NEP-LINK ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'NEP turbidity distribution histogram (WHO/EPA bands)' })
  @ApiQuery({ name: 'sessionId', required: false, description: 'NepSession UUID v4' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('nep/turbidity-distribution')
  nepTurbidityDistribution(
    @Query('sessionId') sessionId: string,
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.nepTurbidityDistribution(user.organizationId, sessionId, deviceId, from, to, { demoOnly: parseDemoOnly(demo) });
  }

  @ApiOperation({ summary: 'NEP multi-session comparison overlay (offset-from-start axis)' })
  @ApiQuery({ name: 'sessionIds', required: true, description: 'Repeatable: sessionIds[]=uuid1&sessionIds[]=uuid2' })
  @Get('nep/session-comparison')
  nepSessionComparison(@Query('sessionIds') sessionIds: string | string[], @CurrentUser() user: JWTPayload) {
    return this.analytics.nepSessionComparison(user.organizationId, toArray(sessionIds));
  }

  @ApiOperation({ summary: 'NEP water quality summary badge (WHO/EPA)' })
  @ApiQuery({ name: 'sessionId', required: true, description: 'NepSession UUID v4' })
  @Get('nep/water-quality-summary')
  nepWaterQuality(@Query('sessionId') sessionId: string, @CurrentUser() user: JWTPayload) {
    return this.analytics.nepWaterQuality(user.organizationId, sessionId);
  }

  @ApiOperation({ summary: 'NEP probe-range (R1/R2/R3) daily breakdown' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('nep/probe-range-breakdown')
  nepProbeBreakdown(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.nepProbeBreakdown(user.organizationId, deviceId, from, to, { demoOnly: parseDemoOnly(demo) });
  }

  @ApiOperation({ summary: 'NEP turbidity↔temperature Pearson correlation + scatter' })
  @ApiQuery({ name: 'sessionId', required: false, description: 'NepSession UUID v4' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('nep/turbidity-temperature-correlation')
  nepCorrelation(
    @Query('sessionId') sessionId: string,
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.nepCorrelation(user.organizationId, sessionId, deviceId, from, to, { demoOnly: parseDemoOnly(demo) });
  }

  @ApiOperation({ summary: 'NEP turbidity spike events within a session' })
  @ApiQuery({ name: 'sessionId', required: true, description: 'NepSession UUID v4' })
  @ApiQuery({ name: 'minNtu', required: false, description: 'Threshold (default: 150% of session mean)' })
  @ApiQuery({ name: 'eventGapMin', required: false, description: 'Gap to end an event (default 15)' })
  @Get('nep/session-events')
  nepSessionEvents(
    @Query('sessionId') sessionId: string,
    @Query('minNtu') minNtu: string,
    @Query('eventGapMin') eventGapMin: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.nepSessionEvents(
      user.organizationId,
      sessionId,
      minNtu ? parseFloat(minNtu) : undefined,
      eventGapMin ? parseInt(eventGapMin, 10) : 15,
    );
  }

  @ApiOperation({ summary: 'NEP GPS density spatial heatmap (grid-cell turbidity averages)' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'resolution', required: false, description: 'low (100m) | medium (10m) | high (1m)' })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('nep/gps-density')
  nepGpsDensity(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('resolution') resolution: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.nepGpsDensity(user.organizationId, deviceId, from, to, resolution ?? 'medium', { demoOnly: parseDemoOnly(demo) });
  }

  // ── Org / utility ─────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Org multi-device sensor overlay' })
  @ApiQuery({ name: 'deviceIds', required: true, description: 'Repeatable: deviceIds[]=id1&deviceIds[]=id2' })
  @ApiQuery({ name: 'sensor', required: true, description: VALID_MET_SENSORS })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @ApiQuery({ name: 'interval', required: false, description: 'Bucket size, e.g. 5min | 1h | 1d' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo-device data ONLY; omitted/false → real-device data only' })
  @Get('org/device-comparison')
  orgDeviceComparison(
    @Query('deviceIds') deviceIds: string | string[],
    @Query('sensor') sensor: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('interval') interval: string,
    @Query('demoOnly') demo: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.analytics.orgDeviceComparison(user.organizationId, toArray(deviceIds), sensor, from, to, interval ?? '1h', {
      demoOnly: parseDemoOnly(demo),
    });
  }

  @ApiOperation({ summary: 'Org fleet health table (online/battery/usage/storage)' })
  @ApiQuery({ name: 'demoOnly', required: false, description: 'true → demo devices ONLY; omitted/false → real devices only' })
  @Get('org/fleet-health')
  orgFleetHealth(@Query('demoOnly') demo: string, @CurrentUser() user: JWTPayload) {
    return this.analytics.orgFleetHealth(user.organizationId, { demoOnly: parseDemoOnly(demo) });
  }

  // ── Daily-summary rollups (§10.7) ────────────────────────────────────────────

  @ApiOperation({ summary: 'MET daily-summary rollups (completeness, prevailing wind, Beaufort dist, min/max bands, solar/precip)' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'from', required: false, description: 'Unix ms (default: 30 days ago)' })
  @ApiQuery({ name: 'to', required: false, description: 'Unix ms (default: now)' })
  @Get('met/daily-summary')
  metDailySummary(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dailySummary.getMetDailySummaries(user.organizationId, deviceId, from, to);
  }

  @ApiOperation({ summary: 'NEP daily-summary rollups (turbidity min/max bands, completeness)' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'from', required: false, description: 'Unix ms (default: 30 days ago)' })
  @ApiQuery({ name: 'to', required: false, description: 'Unix ms (default: now)' })
  @Get('nep/daily-summary')
  nepDailySummary(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JWTPayload,
  ) {
    return this.dailySummary.getNepDailySummaries(user.organizationId, deviceId, from, to);
  }

  @ApiOperation({ summary: 'Unit conversion utility (wind/pressure/temp/altitude + Beaufort)' })
  @ApiQuery({ name: 'value', required: true, description: 'Numeric value to convert' })
  @ApiQuery({ name: 'fromUnit', required: true, description: 'Source unit, e.g. m/s' })
  @ApiQuery({ name: 'toUnit', required: true, description: 'Target unit, e.g. km/h' })
  @Get('unit-convert')
  unitConvert(@Query('value') value: string, @Query('fromUnit') fromUnit: string, @Query('toUnit') toUnit: string) {
    return this.analytics.unitConvert(parseFloat(value), fromUnit, toUnit);
  }

  // ── Bulk export ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'MET bulk export (CSV or JSON), max 90 days' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'format', required: false, description: 'csv (default) | json' })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @Get('met/export-bulk')
  async metExportBulk(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: string,
    @CurrentUser() user: JWTPayload,
    @Res() res: Response,
  ) {
    const out = await this.analytics.exportMetBulk(user.organizationId, deviceId, from, to, format === 'json' ? 'json' : 'csv');
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.body);
  }

  @ApiOperation({ summary: 'NEP bulk export (CSV or JSON), max 30 days' })
  @ApiQuery({ name: 'deviceId', required: true, description: 'Device ObjectId (from POST /v1/devices)' })
  @ApiQuery({ name: 'format', required: false, description: 'csv (default) | json' })
  @ApiQuery({ name: 'from', required: false, description: 'Window start (Unix ms). Omit for no lower bound ("All time").' })
  @ApiQuery({ name: 'to', required: false, description: 'Window end (Unix ms, default now)' })
  @Get('nep/export-bulk')
  async nepExportBulk(
    @Query('deviceId') deviceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: string,
    @CurrentUser() user: JWTPayload,
    @Res() res: Response,
  ) {
    const out = await this.analytics.exportNepBulk(user.organizationId, deviceId, from, to, format === 'json' ? 'json' : 'csv');
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.body);
  }
}
