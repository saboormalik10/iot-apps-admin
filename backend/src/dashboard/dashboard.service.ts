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

  // ── GET /dashboard/met/stats ──────────────────────────────────────────────

  async getMetStats(organizationId: string, deviceId: string) {
    const cacheKey = `met:stats:${organizationId}:${deviceId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    const records = await MetRecord.find({ organizationId: orgId, deviceId: devId, deletedAt: null })
      .select('_id dateStartMs measureCount')
      .lean();

    if (!records.length) {
      return toCache(cacheKey, { deviceId, totalRecords: 0, totalMeasures: 0, totalLoggingHours: 0 }, 3_600_000);
    }

    const recordIds = records.map((r) => r._id);
    const totalMeasures = records.reduce((a, r) => a + (r.measureCount ?? 0), 0);

    const agg = await MetMeasure.aggregate([
      { $match: { recordId: { $in: recordIds }, rowType: 'data' } },
      {
        $group: {
          _id: null,
          maxWindSpeedMs: { $max: '$windSpeedMs' },
          maxWindSpeedKmh: { $max: '$windSpeedKmh' },
          minTempC: { $min: '$tempC' },
          maxTempC: { $max: '$tempC' },
          minPressureHpa: { $min: '$pressureHpa' },
          maxPressureHpa: { $max: '$pressureHpa' },
        },
      },
    ]);
    const a = agg[0] ?? {};
    const dateStarts = records.map((r) => r.dateStartMs).filter((v) => v != null);

    const result = {
      deviceId,
      totalRecords: records.length,
      totalMeasures,
      totalLoggingHours: Math.round((totalMeasures / 3600) * 100) / 100,
      firstRecordAt: dateStarts.length ? Math.min(...dateStarts) : null,
      lastRecordAt: dateStarts.length ? Math.max(...dateStarts) : null,
      maxWindSpeedMs: a.maxWindSpeedMs ?? null,
      maxWindSpeedKmh: a.maxWindSpeedKmh ?? null,
      minTempC: a.minTempC ?? null,
      maxTempC: a.maxTempC ?? null,
      minPressureHpa: a.minPressureHpa ?? null,
      maxPressureHpa: a.maxPressureHpa ?? null,
    };
    // 1-hour cache for lifetime stats
    return toCache(cacheKey, result, 3_600_000);
  }

  // ── GET /dashboard/nep/analytics ──────────────────────────────────────────

  async getNepAnalytics(organizationId: string, deviceId: string, fromMs?: number, toMs?: number) {
    const to = toMs ?? Date.now();
    const from = fromMs ?? to - 30 * 86_400_000;
    const cacheKey = `nep:analytics:${organizationId}:${deviceId}:${from}:${to}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    const sessions = await NepSession.find({
      organizationId: orgId,
      deviceId: devId,
      deletedAt: null,
      startTimestamp: { $gte: from, $lte: to },
    })
      .select('id startTimestamp')
      .lean();

    if (!sessions.length) return toCache(cacheKey, { deviceId, data: [] });

    const sessionIds = sessions.map((s) => s.id);
    const samples = await NepSample.find({ sessionId: { $in: sessionIds }, turbidityValue: { $ne: null } })
      .select('timestamp turbidityValue')
      .lean();

    const byDay = new Map<string, { sum: number; min: number; max: number; n: number; sessions: Set<string> }>();
    const sessionDay = new Map<string, string>();
    for (const s of sessions) sessionDay.set(s.id, new Date(s.startTimestamp).toISOString().slice(0, 10));

    for (const sp of samples) {
      const date = new Date(sp.timestamp as number).toISOString().slice(0, 10);
      let d = byDay.get(date);
      if (!d) {
        d = { sum: 0, min: Infinity, max: -Infinity, n: 0, sessions: new Set() };
        byDay.set(date, d);
      }
      const v = sp.turbidityValue as number;
      d.sum += v;
      d.n++;
      if (v < d.min) d.min = v;
      if (v > d.max) d.max = v;
    }
    // session count per day
    for (const [id, date] of sessionDay) {
      const d = byDay.get(date);
      if (d) d.sessions.add(id);
    }

    const data = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({
        date,
        avgTurbidity: d.n ? Math.round((d.sum / d.n) * 100) / 100 : null,
        maxTurbidity: d.n ? Math.round(d.max * 100) / 100 : null,
        minTurbidity: d.n ? Math.round(d.min * 100) / 100 : null,
        sessionCount: d.sessions.size,
        totalSamples: d.n,
      }));
    return toCache(cacheKey, { deviceId, from, to, data });
  }

  // ── GET /dashboard/org/device-map ─────────────────────────────────────────

  async getOrgDeviceMap(organizationId: string) {
    const cacheKey = `org:device-map:${organizationId}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const ONLINE_MS = 5 * 60 * 1000;
    const now = Date.now();

    const devices = await Device.find({ organizationId: orgId, deletedAt: null }).lean();

    const out = await Promise.all(
      devices.map(async (d) => {
        let lastGpsLat: number | null = null;
        let lastGpsLng: number | null = null;
        let lastGpsAltM: number | null = null;
        let lastWindSpeedKmh: number | null = null;
        let lastTurbidityNtu: number | null = null;

        if (d.type === 'MET-LINK') {
          const m = await MetMeasure.findOne({
            organizationId: orgId,
            gpsLat: { $ne: null },
            gpsLng: { $ne: null },
            recordId: { $in: await this._deviceRecordIds(orgId, d._id as Types.ObjectId) },
          })
            .sort({ timestampMs: -1 })
            .select('gpsLat gpsLng gpsAltM windSpeedKmh')
            .lean();
          if (m) {
            lastGpsLat = m.gpsLat;
            lastGpsLng = m.gpsLng;
            lastGpsAltM = m.gpsAltM;
            lastWindSpeedKmh = m.windSpeedKmh;
          }
        } else {
          const sessions = await NepSession.find({ organizationId: orgId, deviceId: d._id as Types.ObjectId, deletedAt: null })
            .select('id')
            .lean();
          const s = await NepSample.findOne({
            sessionId: { $in: sessions.map((x) => x.id) },
            locationLat: { $ne: null },
            locationLng: { $ne: null },
          })
            .sort({ timestamp: -1 })
            .select('locationLat locationLng turbidityValue')
            .lean();
          if (s) {
            lastGpsLat = s.locationLat;
            lastGpsLng = s.locationLng;
            lastTurbidityNtu = s.turbidityValue;
          }
        }

        if (lastGpsLat == null || lastGpsLng == null) return null; // omit devices with no GPS

        return {
          deviceId: (d._id as Types.ObjectId).toString(),
          deviceName: d.customName ?? d.name,
          type: d.type,
          isOnline: d.lastSeenAt ? now - new Date(d.lastSeenAt).getTime() < ONLINE_MS : false,
          lastSeenAt: d.lastSeenAt,
          lastGpsLat,
          lastGpsLng,
          lastGpsAltM,
          lastWindSpeedKmh,
          lastTurbidityNtu,
          batteryPct: d.lastBatteryPct,
        };
      }),
    );
    return toCache(cacheKey, out.filter((x) => x !== null), 5 * 60_000);
  }

  private async _deviceRecordIds(orgId: Types.ObjectId, deviceId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const recs = await MetRecord.find({ organizationId: orgId, deviceId, deletedAt: null }).select('_id').lean();
    return recs.map((r) => r._id as Types.ObjectId);
  }
}
