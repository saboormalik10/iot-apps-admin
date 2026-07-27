import { Injectable, BadRequestException } from '@nestjs/common';
import { Types, PipelineStage } from 'mongoose';
import { downsample, downsampleEnvelope } from '../utils/cache.util';
import { sectorIndex, speedBandIndex, SPEED_BANDS } from '../analytics/analytics.util';

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

// ─── Adaptive time-bucketing for the MET history graphs ─────────────────────
// (`downsample`/`downsampleEnvelope` now live in ../utils/cache.util so the
//  analytics module and the dashboard share one implementation.)

/** Hard cap on points returned per MET history series. Adaptive bucketing (below)
 *  already targets ~this many buckets; the peak-preserving `downsampleEnvelope`
 *  is a safety net that keeps the min/max band intact if a series still overshoots.
 *  Was 1500 + naive decimation — lowered now that the envelope preserves spikes. */
const MET_HISTORY_MAX_POINTS = 500;

/** How many buckets the DB aggregation aims to return, regardless of window width.
 *  ~500 points is more than a chart has pixels, so the graph looks identical. */
const MET_HISTORY_TARGET_BUCKETS = 500;

/** Bucket-size ladder (ms), coarsest-last. `pickBucketMs` selects the smallest
 *  bucket that keeps the series under the target for the window — but never finer
 *  than 1 minute (the native sample cadence), so we never invent resolution. */
const BUCKET_LADDER_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  15 * 60_000, // 15 min
  30 * 60_000, // 30 min
  60 * 60_000, // 1 h
  3 * 60 * 60_000, // 3 h
  6 * 60 * 60_000, // 6 h
  12 * 60 * 60_000, // 12 h
  24 * 60 * 60_000, // 1 day
];

export function pickBucketMs(spanMs: number, targetBuckets = MET_HISTORY_TARGET_BUCKETS): number {
  const raw = spanMs / Math.max(1, targetBuckets);
  return BUCKET_LADDER_MS.find((v) => v >= raw) ?? BUCKET_LADDER_MS[BUCKET_LADDER_MS.length - 1];
}

/** Bucket size for a MET history query. Bases granularity on the ACTUAL data
 *  span (clamped to the records that overlap the window), NOT the raw `from`/`to`
 *  — the frontend sends `from=0` for "All time", and sizing off epoch would
 *  collapse everything into a handful of day-wide buckets. */
function metBucketMs(
  records: Array<{ dateStartMs?: number | null; dateEndMs?: number | null }>,
  fromMs: number,
  toMs: number,
): number {
  const now = Date.now();
  // reduce (not Math.min(...spread)) — a device can accumulate a lot of records
  // and spreading a huge array into Math.min risks a call-stack overflow.
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const r of records) {
    if (typeof r.dateStartMs === 'number' && r.dateStartMs < minStart) minStart = r.dateStartMs;
    const end = typeof r.dateEndMs === 'number' ? r.dateEndMs : now;
    if (end > maxEnd) maxEnd = end;
  }
  const effFrom = Math.max(fromMs, Number.isFinite(minStart) ? minStart : fromMs);
  const effTo = Math.min(toMs, Number.isFinite(maxEnd) ? maxEnd : toMs);
  return pickBucketMs(Math.max(60_000, effTo - effFrom));
}
import { Device } from '../models/Device';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { AlertRule } from '../models/AlertRule';

// ─── Daily-count sparkline helper (§10.8) ────────────────────────────────────

/** Aggregates the last `days` daily document counts (by `createdAt`, UTC),
 *  zero-filled oldest→newest, for KPI-tile sparklines. */
async function dailyCounts(
  model: { aggregate(pipeline: unknown[]): Promise<Array<{ _id: string; count: number }>> },
  orgId: Types.ObjectId,
  days: number,
  includeDemo: boolean,
  extraMatch: Record<string, unknown> = {},
): Promise<number[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1)); // include today → `days` buckets
  const rows = await model.aggregate([
    {
      $match: {
        organizationId: orgId,
        deletedAt: null,
        createdAt: { $gte: start },
        ...(includeDemo ? {} : { isDemoMode: false }),
        ...extraMatch,
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
        count: { $sum: 1 },
      },
    },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r.count]));
  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(byDay.get(d.toISOString().slice(0, 10)) ?? 0);
  }
  return out;
}

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

  async getSummary(
    organizationId: string,
    includeDemo = false,
    type?: 'MET-LINK' | 'NEP-LINK',
    deviceId?: string,
  ) {
    const cacheKey = `summary:${organizationId}:${includeDemo}:${type ?? 'all'}:${deviceId ?? 'all'}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    // Records/sessions carry isDemoMode; devices do not (a device is never "demo").
    const demoFilter = includeDemo ? {} : { isDemoMode: false };

    // Scope narrowing: `type` restricts device counts to that family and zeroes the
    // other family's data counts; `deviceId` narrows every count to one device.
    const devMatch: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
    if (type) devMatch.type = type;
    if (deviceId && Types.ObjectId.isValid(deviceId)) devMatch._id = new Types.ObjectId(deviceId);

    const dataMatch: Record<string, unknown> = {};
    if (deviceId && Types.ObjectId.isValid(deviceId)) dataMatch.deviceId = new Types.ObjectId(deviceId);

    const countMet = !type || type === 'MET-LINK';
    const countNep = !type || type === 'NEP-LINK';

    const SPARKLINE_DAYS = 14;
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
    const zeros = () => Promise.resolve(new Array(SPARKLINE_DAYS).fill(0) as number[]);

    const [
      totalDevices,
      onlineDevices,
      metDevices,
      nepDevices,
      totalRecords,
      totalSessions,
      activeAlertRules,
      recordsSparkline,
      sessionsSparkline,
    ] = await Promise.all([
      Device.countDocuments(devMatch),
      // Online = seen in the last 5 min (same rule as the fleet table), not the
      // sticky isOnline flag which is never reset.
      Device.countDocuments({ ...devMatch, lastSeenAt: { $gte: new Date(Date.now() - ONLINE_THRESHOLD_MS) } }),
      countMet ? Device.countDocuments({ ...devMatch, type: 'MET-LINK' }) : Promise.resolve(0),
      countNep ? Device.countDocuments({ ...devMatch, type: 'NEP-LINK' }) : Promise.resolve(0),
      countMet ? MetRecord.countDocuments({ organizationId: orgId, deletedAt: null, ...demoFilter, ...dataMatch }) : Promise.resolve(0),
      countNep ? NepSession.countDocuments({ organizationId: orgId, deletedAt: null, ...demoFilter, ...dataMatch }) : Promise.resolve(0),
      AlertRule.countDocuments({ organizationId: orgId, isActive: true }),
      countMet ? dailyCounts(MetRecord, orgId, SPARKLINE_DAYS, includeDemo, dataMatch) : zeros(),
      countNep ? dailyCounts(NepSession, orgId, SPARKLINE_DAYS, includeDemo, dataMatch) : zeros(),
    ]);

    const result = {
      totalDevices,
      onlineDevices,
      offlineDevices: totalDevices - onlineDevices,
      metLinkDevices: metDevices,
      nepLinkDevices: nepDevices,
      totalMetRecords: totalRecords,
      totalNepSessions: totalSessions,
      // §10.8 enrichment — armed alert rules + last-14-day daily-count sparklines
      activeAlertRules,
      sparklines: { records: recordsSparkline, sessions: sessionsSparkline },
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

  async getMetLatest(organizationId: string, deviceId: string, includeDemo = false) {
    const cacheKey = `met:latest:${organizationId}:${deviceId}:${includeDemo}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    // Find the most recent non-deleted record for this device
    const latestRecord = await MetRecord.findOne({
      organizationId: orgId,
      deviceId: devId,
      deletedAt: null,
      ...(includeDemo ? {} : { isDemoMode: false }),
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

  async getMetWindrose(organizationId: string, deviceId: string, includeDemo = false) {
    const cacheKey = `met:windrose:${organizationId}:${deviceId}:${includeDemo}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    // Find most recent record
    const latestRecord = await MetRecord.findOne({
      organizationId: orgId,
      deviceId: devId,
      deletedAt: null,
      ...(includeDemo ? {} : { isDemoMode: false }),
    })
      .sort({ dateStartMs: -1 })
      .select('_id')
      .lean();

    const emptyMatrix = () => Array.from({ length: 16 }, () => Array(SPEED_BANDS.length).fill(0));
    const bands = SPEED_BANDS.map((b) => b.label);

    if (!latestRecord) {
      return toCache(cacheKey, {
        recordId: null,
        newestTsMs: null,
        bands,
        matrices: {
          true: { '10m': emptyMatrix(), '2m': emptyMatrix() },
          relative: { '10m': emptyMatrix(), '2m': emptyMatrix() },
        },
      });
    }

    // Last 600 measures (≈10 min at 1/sec)
    const last600 = await MetMeasure.find({
      recordId: latestRecord._id,
      rowType: 'data',
      windSpeedMs: { $ne: null },
      windDirTrueDeg: { $ne: null },
    })
      .sort({ timestampMs: -1 })
      .limit(600)
      .select('windSpeedMs windDirTrueDeg windDirRelDeg timestampMs')
      .lean();

    // Last 120 measures (≈2 min)
    const last120 = last600.slice(0, 120);

    // Bin server-side into the 16-sector × speed-band matrix the WindRose chart
    // renders — so the browser receives a ~640-number matrix instead of up to 600
    // raw samples and does zero client-side bucketing (§ graph-data contract).
    const buildMatrix = (
      samples: typeof last600,
      dirField: 'windDirTrueDeg' | 'windDirRelDeg',
    ): number[][] => {
      const m = emptyMatrix();
      for (const s of samples) {
        const dir = s[dirField];
        const spd = s.windSpeedMs;
        if (dir == null || spd == null) continue;
        m[sectorIndex(dir)][speedBandIndex(spd)] += 1;
      }
      return m;
    };

    const result = {
      recordId: latestRecord._id,
      // Arrays are sorted newest-first, so element 0 is the freshest sample.
      newestTsMs: last600[0]?.timestampMs ?? null,
      bands,
      matrices: {
        true: {
          '10m': buildMatrix(last600, 'windDirTrueDeg'),
          '2m': buildMatrix(last120, 'windDirTrueDeg'),
        },
        relative: {
          '10m': buildMatrix(last600, 'windDirRelDeg'),
          '2m': buildMatrix(last120, 'windDirRelDeg'),
        },
      },
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
    includeDemo = false,
  ) {
    const field = SENSOR_FIELD_MAP[sensor];
    if (!field) {
      throw new BadRequestException(
        `Unknown sensor "${sensor}". Valid values: ${Object.keys(SENSOR_FIELD_MAP).join(', ')}`,
      );
    }

    const cacheKey = `met:history:${organizationId}:${deviceId}:${sensor}:${fromMs}:${toMs}:${includeDemo}`;
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
      ...(includeDemo ? {} : { isDemoMode: false }),
    })
      .select('_id dateStartMs dateEndMs')
      .lean();

    if (!records.length) {
      return toCache(cacheKey, { sensor, unit: SENSOR_UNIT_MAP[sensor], data: [], bucketMs: 60_000 });
    }

    const recordIds = records.map((r) => r._id);

    // Adaptive bucket size: keep the returned series ~MET_HISTORY_TARGET_BUCKETS
    // points wide whatever the window, instead of always bucketing at 1 minute
    // (which yields ~40k buckets for a 30-day window that then have to be thrown
    // away). Narrow windows stay at full 1-minute resolution.
    const bucketMs = metBucketMs(records, fromMs, toMs);

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
          _id: { $subtract: ['$timestampMs', { $mod: ['$timestampMs', bucketMs] }] },
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

    // Safety net: even after adaptive bucketing, cap the series — but with the
    // peak-preserving envelope so gusts/extremes survive the reduction.
    const data = downsampleEnvelope(await MetMeasure.aggregate(pipeline), MET_HISTORY_MAX_POINTS);
    const result = { sensor, unit: SENSOR_UNIT_MAP[sensor], data, bucketMs };
    return toCache(cacheKey, result);
  }

  // ── GET /dashboard/met/history-multi ──────────────────────────────────────

  /**
   * Multi-sensor variant of `getMetHistory`: aggregates every requested sensor's
   * min/avg/max per adaptive bucket in ONE round-trip (a `$facet` sub-pipeline
   * per sensor), so the dashboard graph stack fetches all 8 charts with a single
   * request + payload instead of 8. Each sub-pipeline keeps its own `$ne: null`
   * filter so per-sensor extremes are correct even where other sensors are null.
   */
  async getMetHistoryMulti(
    organizationId: string,
    deviceId: string,
    sensors: string[],
    fromMs: number,
    toMs: number,
    includeDemo = false,
  ) {
    if (!sensors.length) {
      throw new BadRequestException('sensors is required (comma-separated list)');
    }
    const fields = sensors.map((sensor) => {
      const field = SENSOR_FIELD_MAP[sensor];
      if (!field) {
        throw new BadRequestException(
          `Unknown sensor "${sensor}". Valid values: ${Object.keys(SENSOR_FIELD_MAP).join(', ')}`,
        );
      }
      return { sensor, field };
    });

    const cacheKey = `met:history-multi:${organizationId}:${deviceId}:${sensors.join(',')}:${fromMs}:${toMs}:${includeDemo}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    const records = await MetRecord.find({
      organizationId: orgId,
      deviceId: devId,
      deletedAt: null,
      dateStartMs: { $lte: toMs },
      $or: [{ dateEndMs: null }, { dateEndMs: { $gte: fromMs } }],
      ...(includeDemo ? {} : { isDemoMode: false }),
    })
      .select('_id dateStartMs dateEndMs')
      .lean();

    const emptySeries = () =>
      Object.fromEntries(fields.map(({ sensor }) => [sensor, { unit: SENSOR_UNIT_MAP[sensor], data: [] }]));

    if (!records.length) {
      return toCache(cacheKey, { from: fromMs, to: toMs, bucketMs: 60_000, series: emptySeries() });
    }

    const recordIds = records.map((r) => r._id);
    const bucketMs = metBucketMs(records, fromMs, toMs);

    // One `$facet` per sensor — MongoDB scans the windowed rows once, then runs
    // each sensor's group/project against that shared input.
    const facet: Record<string, unknown[]> = {};
    for (const { sensor, field } of fields) {
      facet[sensor] = [
        { $match: { [field]: { $ne: null } } },
        {
          $group: {
            _id: { $subtract: ['$timestampMs', { $mod: ['$timestampMs', bucketMs] }] },
            min: { $min: `$${field}` },
            max: { $max: `$${field}` },
            avg: { $avg: `$${field}` },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
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
    }

    const pipeline = [
      {
        $match: {
          recordId: { $in: recordIds },
          rowType: 'data',
          timestampMs: { $gte: fromMs, $lte: toMs },
        },
      },
      { $facet: facet },
    ] as unknown as PipelineStage[];

    const [facetResult] = (await MetMeasure.aggregate(pipeline)) as Array<Record<string, unknown[]>>;
    const series = Object.fromEntries(
      fields.map(({ sensor }) => [
        sensor,
        {
          unit: SENSOR_UNIT_MAP[sensor],
          data: downsampleEnvelope((facetResult?.[sensor] ?? []) as never[], MET_HISTORY_MAX_POINTS),
        },
      ]),
    );

    return toCache(cacheKey, { from: fromMs, to: toMs, bucketMs, series });
  }

  // ── GET /dashboard/nep/sessions ───────────────────────────────────────────

  async getNepSessions(
    organizationId: string,
    deviceId?: string,
    page = 1,
    limit = 20,
    filters: { from?: number; to?: number; probeRange?: string; search?: string } = {},
  ) {
    const { from, to, probeRange, search } = filters;
    const cacheKey = `nep:sessions:${organizationId}:${deviceId ?? 'all'}:${page}:${limit}:${from ?? ''}:${to ?? ''}:${probeRange ?? ''}:${search ?? ''}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const query: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
    if (deviceId) query.deviceId = new Types.ObjectId(deviceId);
    if (probeRange) query.probeRange = probeRange;
    if (from != null || to != null) {
      const range: Record<string, number> = {};
      if (from != null) range.$gte = from;
      if (to != null) range.$lte = to;
      query.startTimestamp = range;
    }
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ deviceName: rx }, { comment: rx }];
    }

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

  async getNepLatest(organizationId: string, deviceId: string, includeDemo = false) {
    const cacheKey = `nep:latest:${organizationId}:${deviceId}:${includeDemo}`;
    const cached = fromCache<unknown>(cacheKey);
    if (cached) return cached;

    const orgId = new Types.ObjectId(organizationId);
    const devId = new Types.ObjectId(deviceId);

    const latestSession = await NepSession.findOne({
      organizationId: orgId,
      deviceId: devId,
      deletedAt: null,
      ...(includeDemo ? {} : { isDemoMode: false }),
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
    // Missing `from` = "no lower bound" (matches the Scope Bar "All time" preset),
    // consistent with the analytics endpoints' parseWindow.
    const from = fromMs ?? 0;
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
