import { Injectable, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

// ─── Sensor → DB field map ─────────────────────────────────────────────────

const SENSOR_FIELD_MAP: Record<string, string> = {
  wind_speed: 'windSpeedMs',
  wind_dir: 'windDirTrueDeg',
  temperature: 'tempC',
  humidity: 'humidityPct',
  pressure: 'pressureHpa',
  solar: 'solarWm2',
  precipitation: 'precipMm',
  dew_point: 'dewPointC',
  voltage: 'voltageV',
};

const SENSOR_UNIT_MAP: Record<string, string> = {
  wind_speed: 'm/s',
  wind_dir: '°',
  temperature: '°C',
  humidity: '%',
  pressure: 'hPa',
  solar: 'W/m²',
  precipitation: 'mm',
  dew_point: '°C',
  voltage: 'V',
};

// ─── Downsample utility ────────────────────────────────────────────────────

function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = arr.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, i) => arr[Math.floor(i * step)]);
}
import { Device } from '../models/Device';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';

// ─── In-process cache (30-second TTL) ────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function fromCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function toCache<T>(key: string, data: T, ttlMs = 30_000): T {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardService {

  // ── GET /dashboard/summary ────────────────────────────────────────────────

  async getSummary(organizationId: string) {
    const cacheKey = `summary:${organizationId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);

    const [
      totalDevices,
      onlineDevices,
      metDevices,
      nepDevices,
      totalRecords,
      totalSessions,
    ] = await Promise.all([
      Device.countDocuments({ organizationId: orgId, deletedAt: null }),
      Device.countDocuments({ organizationId: orgId, deletedAt: null, isOnline: true }),
      Device.countDocuments({ organizationId: orgId, deletedAt: null, type: 'MET-LINK' }),
      Device.countDocuments({ organizationId: orgId, deletedAt: null, type: 'NEP-LINK' }),
      MetRecord.countDocuments({ organizationId: orgId, deletedAt: null }),
      NepSession.countDocuments({ organizationId: orgId, deletedAt: null }),
    ]);

    const result = {
      totalDevices,
      onlineDevices,
      offlineDevices: totalDevices - onlineDevices,
      metLinkDevices: metDevices,
      nepLinkDevices: nepDevices,
      totalMetRecords: totalRecords,
      totalNepSessions: totalSessions,
      serverTime: new Date().toISOString(),
    };

    return toCache(cacheKey, result);
  }

  // ── GET /dashboard/devices ────────────────────────────────────────────────

  async getDevices(organizationId: string) {
    const cacheKey = `devices:${organizationId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

    const devices = await Device.find({ organizationId: orgId, deletedAt: null })
      .sort({ type: 1, name: 1 })
      .lean();

    const now = Date.now();
    const result = devices.map((d) => ({
      _id: d._id,
      name: d.customName ?? d.name,
      bleId: d.bleId,
      type: d.type,
      firmwareVersion: d.firmwareVersion,
      lastSeenAt: d.lastSeenAt,
      isOnline: d.lastSeenAt ? now - d.lastSeenAt.getTime() < ONLINE_THRESHOLD_MS : false,
      lastBatteryPct: d.lastBatteryPct,
      lastBatteryCharging: d.lastBatteryCharging,
    }));

    return toCache(cacheKey, result);
  }

  // ── GET /dashboard/met/latest ─────────────────────────────────────────────

  async getMetLatest(organizationId: string, deviceId: string) {
    const cacheKey = `met:latest:${organizationId}:${deviceId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    // Find the most recent non-deleted record for this device
    const latestRecord = await MetRecord.findOne({
      organizationId: orgId,
      deviceId: devId,
      deletedAt: null,
    })
      .sort({ dateStartMs: -1 })
      .select('_id deviceName dateStart')
      .lean();

    if (!latestRecord) return toCache(cacheKey, null);

    // Get the latest data row from that record
    const latestMeasure = await MetMeasure.findOne({
      recordId: latestRecord._id,
      rowType: 'data',
    })
      .sort({ timestampMs: -1 })
      .lean();

    if (!latestMeasure) return toCache(cacheKey, null);

    const result = {
      recordId: latestRecord._id,
      deviceName: latestRecord.deviceName,
      recordDateStart: latestRecord.dateStart,
      measuredAt: latestMeasure.timeStamp,
      measuredAtMs: latestMeasure.timestampMs,
      // Wind
      windSpeedMs: latestMeasure.windSpeedMs,
      windSpeedKmh: latestMeasure.windSpeedKmh,
      windSpeedKnots: latestMeasure.windSpeedKnots,
      windSpeedRelMs: latestMeasure.windSpeedRelMs,
      windSpeedTrueMs: latestMeasure.windSpeedTrueMs,
      windDirRelDeg: latestMeasure.windDirRelDeg,
      windDirTrueDeg: latestMeasure.windDirTrueDeg,
      // Atmosphere
      tempC: latestMeasure.tempC,
      humidityPct: latestMeasure.humidityPct,
      pressureHpa: latestMeasure.pressureHpa,
      dewPointC: latestMeasure.dewPointC,
      precipMm: latestMeasure.precipMm,
      precipRateMmHr: latestMeasure.precipRateMmHr,
      solarWm2: latestMeasure.solarWm2,
      qnhHpa: latestMeasure.qnhHpa,
      qfeHpa: latestMeasure.qfeHpa,
      // Power
      voltageV: latestMeasure.voltageV,
      batteryVoltageV: latestMeasure.batteryVoltageV,
      currentA: latestMeasure.currentA,
      // GPS
      gpsLat: latestMeasure.gpsLat,
      gpsLng: latestMeasure.gpsLng,
      gpsAltM: latestMeasure.gpsAltM,
      gpsSatellites: latestMeasure.gpsSatellites,
      phoneLat: latestMeasure.phoneLat,
      phoneLng: latestMeasure.phoneLng,
    };

    return toCache(cacheKey, result);
  }

  // ── GET /dashboard/met/windrose ───────────────────────────────────────────

  async getMetWindrose(organizationId: string, deviceId: string) {
    const cacheKey = `met:windrose:${organizationId}:${deviceId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    // Find most recent record
    const latestRecord = await MetRecord.findOne({
      organizationId: orgId,
      deviceId: devId,
      deletedAt: null,
    })
      .sort({ dateStartMs: -1 })
      .select('_id')
      .lean();

    if (!latestRecord) return toCache(cacheKey, { last600: [], last120: [] });

    // Last 600 measures (≈10 min at 1/sec)
    const last600 = await MetMeasure.find({
      recordId: latestRecord._id,
      rowType: 'data',
      windSpeedMs: { $ne: null },
      windDirTrueDeg: { $ne: null },
    })
      .sort({ timestampMs: -1 })
      .limit(600)
      .select('windSpeedMs windSpeedKmh windDirTrueDeg windDirRelDeg timestampMs')
      .lean();

    // Last 120 measures (≈2 min)
    const last120 = last600.slice(0, 120);

    const mapWind = (m: typeof last600[0]) => ({
      speedMs: m.windSpeedMs,
      speedKmh: m.windSpeedKmh,
      dirTrueDeg: m.windDirTrueDeg,
      dirRelDeg: m.windDirRelDeg,
      timestampMs: m.timestampMs,
    });

    const result = {
      recordId: latestRecord._id,
      last600: last600.map(mapWind),
      last120: last120.map(mapWind),
    };

    return toCache(cacheKey, result);
  }

  // ── GET /dashboard/met/history ────────────────────────────────────────────

  async getMetHistory(
    organizationId: string,
    deviceId: string,
    sensor: string,
    fromMs: number,
    toMs: number,
  ) {
    const field = SENSOR_FIELD_MAP[sensor];
    if (!field) {
      throw new BadRequestException(
        `Unknown sensor "${sensor}". Valid values: ${Object.keys(SENSOR_FIELD_MAP).join(', ')}`,
      );
    }

    const cacheKey = `met:history:${organizationId}:${deviceId}:${sensor}:${fromMs}:${toMs}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    // Find all records for this device that overlap the time window
    const records = await MetRecord.find({
      organizationId: orgId,
      deviceId: devId,
      deletedAt: null,
      dateStartMs: { $lte: toMs },
      $or: [{ dateEndMs: null }, { dateEndMs: { $gte: fromMs } }],
    })
      .select('_id')
      .lean();

    if (!records.length) {
      return toCache(cacheKey, { sensor, unit: SENSOR_UNIT_MAP[sensor], data: [] });
    }

    const recordIds = records.map((r) => r._id);

    // 1-minute bucket aggregation
    const pipeline = [
      {
        $match: {
          recordId: { $in: recordIds },
          rowType: 'data',
          timestampMs: { $gte: fromMs, $lte: toMs },
          [field]: { $ne: null },
        },
      },
      {
        $group: {
          _id: { $subtract: ['$timestampMs', { $mod: ['$timestampMs', 60_000] }] },
          min: { $min: `$${field}` },
          max: { $max: `$${field}` },
          avg: { $avg: `$${field}` },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 as const } },
      {
        $project: {
          _id: 0,
          timestampMs: '$_id',
          min: { $round: ['$min', 2] },
          max: { $round: ['$max', 2] },
          avg: { $round: ['$avg', 2] },
          count: 1,
        },
      },
    ];

    const data = await MetMeasure.aggregate(pipeline);
    const result = { sensor, unit: SENSOR_UNIT_MAP[sensor], data };
    return toCache(cacheKey, result);
  }

  // ── GET /dashboard/nep/sessions ───────────────────────────────────────────

  async getNepSessions(
    organizationId: string,
    deviceId?: string,
    page = 1,
    limit = 20,
  ) {
    const cacheKey = `nep:sessions:${organizationId}:${deviceId ?? 'all'}:${page}:${limit}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const query: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
    if (deviceId) query.deviceId = new Types.ObjectId(deviceId);

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));

    const [total, sessions] = await Promise.all([
      NepSession.countDocuments(query),
      NepSession.find(query)
        .sort({ startTimestamp: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
    ]);

    const result = { total, page: safePage, limit: safeLimit, sessions };
    return toCache(cacheKey, result);
  }

  // ── GET /dashboard/nep/latest ─────────────────────────────────────────────

  async getNepLatest(organizationId: string, deviceId: string) {
    const cacheKey = `nep:latest:${organizationId}:${deviceId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    const latestSession = await NepSession.findOne({
      organizationId: orgId,
      deviceId: devId,
      deletedAt: null,
    })
      .sort({ startTimestamp: -1 })
      .lean();

    if (!latestSession) return toCache(cacheKey, null);

    const latestSample = await NepSample.findOne({ sessionId: latestSession.id })
      .sort({ timestamp: -1 })
      .lean();

    const result = {
      session: {
        id: latestSession.id,
        deviceName: latestSession.deviceName,
        startTimestamp: latestSession.startTimestamp,
        endTimestamp: latestSession.endTimestamp,
        sampleCount: latestSession.sampleCount,
        turbidityAvg: latestSession.turbidityAvg,
        turbidityMin: latestSession.turbidityMin,
        turbidityMax: latestSession.turbidityMax,
        temperatureAvg: latestSession.temperatureAvg,
        probeRange: latestSession.probeRange,
        hasTempData: latestSession.hasTempData,
        hasGpsData: latestSession.hasGpsData,
      },
      latestSample: latestSample
        ? {
            timestamp: latestSample.timestamp,
            turbidityValue: latestSample.turbidityValue,
            temperatureValue: latestSample.temperatureValue,
            probeRange: latestSample.probeRange,
            locationLat: latestSample.locationLat,
            locationLng: latestSample.locationLng,
            batteryLevel: latestSample.batteryLevel,
          }
        : null,
    };

    return toCache(cacheKey, result);
  }

  // ── GET /dashboard/nep/trend ──────────────────────────────────────────────

  async getNepTrend(
    organizationId: string,
    sessionId: string,
    field: 'turbidity' | 'temperature',
  ) {
    const cacheKey = `nep:trend:${organizationId}:${sessionId}:${field}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const dbField = field === 'turbidity' ? 'turbidityValue' : 'temperatureValue';

    const rawSamples = await NepSample.find({
      sessionId,
      [dbField]: { $ne: null },
    })
      .sort({ timestamp: 1 })
      .select(`timestamp ${dbField}`)
      .lean();

    const mapped = rawSamples.map((s) => ({
      timestamp: s.timestamp,
      value: (s[dbField as keyof typeof s] as number),
    }));

    const result = { field, data: downsample(mapped, 500) };
    return toCache(cacheKey, result);
  }

  // ── GET /dashboard/nep/map ────────────────────────────────────────────────

  async getNepMap(organizationId: string, sessionId: string) {
    const cacheKey = `nep:map:${organizationId}:${sessionId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const rawSamples = await NepSample.find({
      sessionId,
      locationLat: { $ne: null },
      locationLng: { $ne: null },
    })
      .sort({ timestamp: 1 })
      .select('timestamp locationLat locationLng turbidityValue probeRange')
      .lean();

    const mapped = rawSamples.map((s) => ({
      timestamp: s.timestamp,
      lat: s.locationLat,
      lng: s.locationLng,
      turbidityValue: s.turbidityValue,
      probeRange: s.probeRange,
    }));

    const result = { sessionId, points: downsample(mapped, 300) };
    return toCache(cacheKey, result);
  }
}
