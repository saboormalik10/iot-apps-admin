import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { NepSession, INepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { demoDeviceFilter } from '../utils/demo-scope.util';
import { Device } from '../models/Device';
import { AuditLog } from '../models/AuditLog';
import { DomainEvent } from '../realtime/realtime.events';

function deriveProbeRange(turbidity: number): 'R1' | 'R2' | 'R3' {
  if (turbidity < 10) return 'R1';
  if (turbidity <= 1000) return 'R2';
  return 'R3';
}

const PROBE_RANGES = ['R1', 'R2', 'R3'] as const;

interface SampleInput {
  turbidityValue?: number | null;
  temperatureValue?: number | null;
  locationLat?: number | null;
  locationLng?: number | null;
  probeRange?: string | null;
}

function computeStats(samples: SampleInput[]) {
  const turbidities = samples.map((s) => s.turbidityValue).filter((v): v is number => v != null);
  const temperatures = samples.map((s) => s.temperatureValue).filter((v): v is number => v != null);
  const hasGps = samples.some((s) => s.locationLat != null && s.locationLng != null);
  const turbidityAvg = turbidities.length ? turbidities.reduce((a, b) => a + b, 0) / turbidities.length : null;
  const turbidityMin = turbidities.length ? Math.min(...turbidities) : null;
  const turbidityMax = turbidities.length ? Math.max(...turbidities) : null;
  const temperatureAvg = temperatures.length ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : null;
  const temperatureMin = temperatures.length ? Math.min(...temperatures) : null;
  const temperatureMax = temperatures.length ? Math.max(...temperatures) : null;
  const firstTurbidity = turbidities[0] ?? null;
  // Prefer the range the INSTRUMENT reported. `deriveProbeRange` infers it from the
  // turbidity value, which disagrees with the hardware whenever a reading sits
  // outside the assumed band for the range actually selected. Falling back keeps
  // legacy rows (and app builds that don't send `probeRange` yet) working unchanged.
  const reportedRange =
    samples.find((s) => s.probeRange != null && PROBE_RANGES.includes(s.probeRange as never))
      ?.probeRange ?? null;
  const probeRange =
    (reportedRange as 'R1' | 'R2' | 'R3' | null) ??
    (firstTurbidity != null ? deriveProbeRange(firstTurbidity) : null);
  return {
    sampleCount: samples.length,
    turbidityAvg: turbidityAvg != null ? Math.round(turbidityAvg * 100) / 100 : null,
    turbidityMin, turbidityMax,
    temperatureAvg: temperatureAvg != null ? Math.round(temperatureAvg * 100) / 100 : null,
    temperatureMin, temperatureMax,
    hasTempData: temperatures.length > 0,
    hasGpsData: hasGps,
    probeRange,
  };
}

export interface ListSessionsOptions {
  organizationId: string;
  deviceId?: string;
  from?: number;
  to?: number;
  probeRange?: 'R1' | 'R2' | 'R3';
  page?: number;
  limit?: number;
  /** true → demo-device sessions ONLY; false/undefined → real-device sessions only. */
  demoOnly?: boolean;
}

export interface CreateSessionInput {
  id: string;
  deviceId: string;
  deviceName: string;
  startTimestamp: number;
  endTimestamp?: number | null;
  timezoneName: string;
  timezoneOffset: number;
  turbidityEnabled?: boolean;
  temperatureEnabled?: boolean;
  locationEnabled?: boolean;
  comment?: string;
  isDemoMode?: boolean;
  samples?: BulkSampleInput[];
}

export interface UpdateSessionInput {
  comment?: string;
  deviceName?: string;
  endTimestamp?: number | null;
  timezoneName?: string;
  timezoneOffset?: number;
  turbidityEnabled?: boolean;
  temperatureEnabled?: boolean;
  locationEnabled?: boolean;
  isDemoMode?: boolean;
}

/**
 * Session fields a client may set via PATCH. Identity/ownership (`id`,
 * `organizationId`, `deviceId`, `syncedAt`) and the sample-derived stats
 * (`sampleCount`, `probeRange`, turbidity/temperature aggregates, `hasTempData`,
 * `hasGpsData`) are intentionally NOT mutable here — they'd corrupt integrity.
 */
const MUTABLE_SESSION_FIELDS: (keyof UpdateSessionInput)[] = [
  'comment',
  'deviceName',
  'endTimestamp',
  'timezoneName',
  'timezoneOffset',
  'turbidityEnabled',
  'temperatureEnabled',
  'locationEnabled',
  'isDemoMode',
];

export interface BulkSampleInput {
  timestamp: number;
  turbidityValue?: number | null;
  temperatureValue?: number | null;
  probeRange?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  batteryLevel?: number | null;
  batteryRawVoltage?: number | null;
  batteryCharging?: boolean | null;
  demoModeEnabled?: boolean | null;
}

export interface GetSamplesOptions {
  organizationId: string;
  sessionId: string;
  page?: number;
  limit?: number;
  downsample?: boolean;
}

const MAX_SAMPLES_PER_REQUEST = 7200;
const DOWNSAMPLE_THRESHOLD = 500;
const ONE_MINUTE_MS = 60 * 1000;

/**
 * Insert only the samples whose timestamp is NOT already stored for this session.
 * This is what makes every sample-upload path retry-safe: re-sending the same
 * payload (mobile retry after a dropped connection) inserts nothing the second
 * time instead of duplicating rows. Returns how many were actually inserted.
 * Shared with SyncService (the /sync/upload path).
 */
export async function insertNewNepSamples(
  sessionId: string,
  organizationId: Types.ObjectId,
  samples: BulkSampleInput[],
): Promise<number> {
  if (!samples.length) return 0;
  const timestamps = samples.map((s) => s.timestamp).filter((t) => t != null);
  const existingDocs = await NepSample.find({ sessionId, timestamp: { $in: timestamps } })
    .select('timestamp')
    .lean();
  const existing = new Set(existingDocs.map((d) => d.timestamp));
  const fresh = samples.filter((s) => !existing.has(s.timestamp));
  if (!fresh.length) return 0;
  await NepSample.insertMany(
    fresh.map((s) => ({
      sessionId,
      organizationId,
      timestamp: s.timestamp,
      turbidityValue: s.turbidityValue ?? null,
      temperatureValue: s.temperatureValue ?? null,
      probeRange: s.probeRange ?? null,
      locationLat: s.locationLat ?? null,
      locationLng: s.locationLng ?? null,
      batteryLevel: s.batteryLevel ?? null,
      batteryRawVoltage: s.batteryRawVoltage ?? null,
      batteryCharging: s.batteryCharging ?? null,
      demoModeEnabled: s.demoModeEnabled ?? null,
    })),
    { ordered: false },
  );
  return fresh.length;
}

/**
 * Recompute a session's sample-derived stats (sampleCount, turbidity/temperature
 * aggregates, hasGpsData, probeRange) from ALL stored samples — the single source
 * of truth. Payload-derived stats are never trusted: a partial or repeated upload
 * would otherwise wipe or double-count them. Shared with SyncService.
 */
export async function recomputeNepSessionStats(sessionId: string) {
  const all = await NepSample.find({ sessionId })
    .select('turbidityValue temperatureValue locationLat locationLng probeRange')
    .lean();
  const stats = computeStats(all);
  await NepSession.updateOne({ id: sessionId }, { $set: stats });
  return stats;
}

@Injectable()
export class SessionsService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async listSessions(opts: ListSessionsOptions) {
    const { organizationId, deviceId, from, to, probeRange, page = 1, limit = 20 } = opts;
    const orgId = new Types.ObjectId(organizationId);
    const query: Record<string, unknown> = {
      organizationId: orgId,
      deletedAt: null,
      // Demo/real is decided by the device that recorded the session.
      ...(await demoDeviceFilter(orgId, !!opts.demoOnly)),
    };
    if (deviceId) query.deviceId = new Types.ObjectId(deviceId);
    if (probeRange) query.probeRange = probeRange;
    if (from || to) {
      query.startTimestamp = {};
      if (from) (query.startTimestamp as Record<string, number>).$gte = from;
      if (to) (query.startTimestamp as Record<string, number>).$lte = to;
    }
    const [items, total] = await Promise.all([
      NepSession.find(query).sort({ startTimestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      NepSession.countDocuments(query),
    ]);
    return { data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async createSession(organizationId: string, input: CreateSessionInput, userId?: string): Promise<INepSession> {
    // The `id` unique index is global, so the idempotency lookup must be too —
    // but a session belonging to ANOTHER org must never be returned or mutated.
    const existing = await NepSession.findOne({ id: input.id });
    if (existing && existing.organizationId.toString() !== organizationId) {
      throw Object.assign(new Error('Session id already exists'), {
        statusCode: 409,
        code: 'SESSION_ID_CONFLICT',
      });
    }
    if (existing) {
      // Metadata convergence: a re-sync may carry an edited comment, or an
      // endTimestamp the first upload didn't have yet. Only these two are applied —
      // identity, ownership and the computed stats stay server-owned (the same
      // rule MUTABLE_SESSION_FIELDS enforces on PATCH).
      let dirty = false;
      if (input.comment !== undefined && input.comment !== existing.comment) {
        existing.comment = input.comment;
        dirty = true;
      }
      if (input.endTimestamp != null && existing.endTimestamp == null) {
        existing.endTimestamp = input.endTimestamp;
        dirty = true;
      }
      if (dirty) await existing.save();

      // Retry path: the first attempt may have died between creating the session
      // and inserting its inline samples — top up whatever is missing (dedup by
      // timestamp) and heal the stats instead of silently dropping the payload.
      if (input.samples?.length) {
        const added = await insertNewNepSamples(existing.id, existing.organizationId, input.samples);
        if (added > 0) {
          await recomputeNepSessionStats(existing.id);
          return (await NepSession.findOne({ id: input.id }))!;
        }
      }
      return existing;
    }

    // A malformed id would make `new Types.ObjectId()` throw a raw BSONError → 500
    // (masked as "An unexpected error occurred" in production). Check it first so
    // the client gets a message naming the field.
    if (!Types.ObjectId.isValid(input.deviceId)) {
      throw Object.assign(new Error('deviceId must be a valid Device id'), {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    }
    // This lookup used to be performed and its result discarded, so a session could
    // be created against a device in another org — or one that does not exist — and
    // still return 201. Mirrors SyncService._upsertNepSession.
    const device = await Device.findOne({
      _id: new Types.ObjectId(input.deviceId),
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    });
    if (!device) {
      throw Object.assign(new Error('Device not found in organisation'), {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }
    const stats = computeStats(input.samples ?? []);
    const session = await NepSession.create({
      id: input.id, organizationId: new Types.ObjectId(organizationId), deviceId: new Types.ObjectId(input.deviceId),
      userId: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null,
      deviceName: input.deviceName, startTimestamp: input.startTimestamp, endTimestamp: input.endTimestamp ?? null,
      timezoneName: input.timezoneName, timezoneOffset: input.timezoneOffset,
      turbidityEnabled: input.turbidityEnabled ?? true, temperatureEnabled: input.temperatureEnabled ?? true,
      locationEnabled: input.locationEnabled ?? false, comment: input.comment ?? '', isDemoMode: input.isDemoMode ?? false,
      syncedAt: new Date(), ...stats,
    });
    if (input.samples && input.samples.length > 0) {
      await insertNewNepSamples(session.id, session.organizationId, input.samples);
    }
    this.eventEmitter.emit(DomainEvent.NEP_SESSION_CREATED, {
      organizationId,
      deviceId: input.deviceId,
      sessionId: session.id,
      startTimestamp: session.startTimestamp,
      probeRange: session.probeRange ?? null,
    });
    return session;
  }

  async getSession(organizationId: string, sessionId: string): Promise<INepSession> {
    const session = await NepSession.findOne({ id: sessionId, organizationId: new Types.ObjectId(organizationId), deletedAt: null });
    if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404, code: 'NOT_FOUND' });
    return session;
  }

  async updateSession(organizationId: string, sessionId: string, body: UpdateSessionInput): Promise<INepSession> {
    const session = await this.getSession(organizationId, sessionId);
    // Apply every provided field that is in the mutable whitelist ("whatever is in
    // the body gets updated" — minus the protected identity/ownership + computed stats).
    for (const key of MUTABLE_SESSION_FIELDS) {
      if (body[key] !== undefined) {
        (session as unknown as Record<string, unknown>)[key] = body[key];
      }
    }
    await session.save();
    return session;
  }

  async deleteSession(organizationId: string, sessionId: string, actor: { userId: string; email: string }): Promise<void> {
    const session = await this.getSession(organizationId, sessionId);
    await NepSample.deleteMany({ sessionId: session.id });
    session.deletedAt = new Date();
    await session.save();
    AuditLog.create({
      organizationId: session.organizationId, userId: new Types.ObjectId(actor.userId), userEmail: actor.email,
      action: 'delete', resourceType: 'session', resourceId: session.id,
      resourceName: 'Session ' + session.id, changes: null,
    }).catch(() => void 0);
  }

  async bulkInsertSamples(organizationId: string, sessionId: string, samples: BulkSampleInput[]): Promise<{ inserted: number }> {
    if (!Array.isArray(samples) || samples.length === 0)
      throw Object.assign(new Error('samples array is required and must not be empty'), { statusCode: 400, code: 'VALIDATION_ERROR' });
    if (samples.length > MAX_SAMPLES_PER_REQUEST)
      throw Object.assign(new Error('Maximum ' + MAX_SAMPLES_PER_REQUEST + ' samples per request'), { statusCode: 400, code: 'TOO_MANY_SAMPLES' });
    const session = await this.getSession(organizationId, sessionId);
    // Dedup by timestamp so a mobile retry of the same batch can't duplicate rows.
    const inserted = await insertNewNepSamples(session.id, new Types.ObjectId(organizationId), samples);
    const stats = await recomputeNepSessionStats(session.id);

    const last = samples[samples.length - 1];
    this.eventEmitter.emit(DomainEvent.NEP_SAMPLE, {
      organizationId,
      deviceId: (session.deviceId as Types.ObjectId).toString(),
      sessionId: session.id,
      sample: {
        timestamp: last.timestamp,
        turbidityValue: last.turbidityValue ?? null,
        temperatureValue: last.temperatureValue ?? null,
        probeRange: last.probeRange ?? stats.probeRange ?? null,
      },
    });
    return { inserted };
  }

  async getSamples(opts: GetSamplesOptions) {
    const { organizationId, sessionId, page = 1, limit = 500, downsample = false } = opts;
    const session = await this.getSession(organizationId, sessionId);
    const total = await NepSample.countDocuments({ sessionId: session.id });
    if (downsample && total > DOWNSAMPLE_THRESHOLD) {
      const rawSamples = await NepSample.find({ sessionId: session.id }).sort({ timestamp: 1 })
        .select('timestamp turbidityValue temperatureValue locationLat locationLng batteryLevel probeRange').lean();
      type Bucket = { bucketStart: number; turbidities: number[]; temperatures: number[]; lats: number[]; lngs: number[]; batteries: number[]; probeRange: string | null };
      const buckets = new Map<number, Bucket>();
      for (const s of rawSamples) {
        const bucketStart = Math.floor(s.timestamp / ONE_MINUTE_MS) * ONE_MINUTE_MS;
        let b = buckets.get(bucketStart);
        if (!b) {
          b = { bucketStart, turbidities: [], temperatures: [], lats: [], lngs: [], batteries: [], probeRange: null };
          buckets.set(bucketStart, b);
        }
        if (s.turbidityValue != null) b.turbidities.push(s.turbidityValue);
        if (s.temperatureValue != null) b.temperatures.push(s.temperatureValue);
        if (s.locationLat != null) b.lats.push(s.locationLat);
        if (s.locationLng != null) b.lngs.push(s.locationLng);
        if (s.batteryLevel != null) b.batteries.push(s.batteryLevel);
        if (s.probeRange) b.probeRange = s.probeRange as string;
      }
      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const downsampled = Array.from(buckets.values()).map((b) => ({ timestamp: b.bucketStart, turbidityValue: avg(b.turbidities), temperatureValue: avg(b.temperatures), locationLat: avg(b.lats), locationLng: avg(b.lngs), batteryLevel: avg(b.batteries), probeRange: b.probeRange, _downsampled: true }));
      return { data: downsampled, meta: { page: 1, limit: downsampled.length, total: downsampled.length, pages: 1, downsampled: true, originalCount: total } };
    }
    const items = await NepSample.find({ sessionId: session.id }).sort({ timestamp: 1 }).skip((page - 1) * limit).limit(limit).lean();
    return { data: items, meta: { page, limit, total, pages: Math.ceil(total / limit), downsampled: false } };
  }

  async exportSessionCsv(organizationId: string, sessionId: string): Promise<string> {
    const session = await this.getSession(organizationId, sessionId);
    const samples = await NepSample.find({ sessionId: session.id }).sort({ timestamp: 1 }).lean();
    const lines: string[] = ['Date,Time,Lat,Lon,Turbidity,Temperature,,Comment,Battery Level', session.timezoneName + ',,,,NTU,°C,,,,%'];
    for (const s of samples) {
      const d = new Date(s.timestamp);
      const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const time = d.toISOString().slice(11, 19);
      lines.push([date, time, s.locationLat ?? '', s.locationLng ?? '', s.turbidityValue ?? '', s.temperatureValue ?? '', '', '', s.batteryLevel ?? ''].join(','));
    }
    return lines.join('\n');
  }
}
