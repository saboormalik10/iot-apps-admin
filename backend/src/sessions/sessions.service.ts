import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { NepSession, INepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { Device } from '../models/Device';
import { AuditLog } from '../models/AuditLog';

function deriveProbeRange(turbidity: number): 'R1' | 'R2' | 'R3' {
  if (turbidity < 10) return 'R1';
  if (turbidity <= 1000) return 'R2';
  return 'R3';
}

interface SampleInput {
  turbidityValue?: number | null;
  temperatureValue?: number | null;
  locationLat?: number | null;
  locationLng?: number | null;
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
  const probeRange = firstTurbidity != null ? deriveProbeRange(firstTurbidity) : null;
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
  samples?: SampleInput[];
}

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

@Injectable()
export class SessionsService {
  async listSessions(opts: ListSessionsOptions) {
    const { organizationId, deviceId, from, to, probeRange, page = 1, limit = 20 } = opts;
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), deletedAt: null };
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

  async createSession(organizationId: string, input: CreateSessionInput): Promise<INepSession> {
    const existing = await NepSession.findOne({ id: input.id });
    if (existing) return existing;
    const device = await Device.findOne({ _id: new Types.ObjectId(input.deviceId), organizationId: new Types.ObjectId(organizationId), deletedAt: null });
    const stats = computeStats(input.samples ?? []);
    const session = await NepSession.create({
      id: input.id, organizationId: new Types.ObjectId(organizationId), deviceId: new Types.ObjectId(input.deviceId),
      deviceName: input.deviceName, startTimestamp: input.startTimestamp, endTimestamp: input.endTimestamp ?? null,
      timezoneName: input.timezoneName, timezoneOffset: input.timezoneOffset,
      turbidityEnabled: input.turbidityEnabled ?? true, temperatureEnabled: input.temperatureEnabled ?? true,
      locationEnabled: input.locationEnabled ?? false, comment: input.comment ?? '', isDemoMode: input.isDemoMode ?? false,
      syncedAt: new Date(), ...stats,
    });
    if (input.samples && input.samples.length > 0) {
      const docs = input.samples.map((s) => ({ sessionId: session.id, organizationId: new Types.ObjectId(organizationId), ...s }));
      await NepSample.insertMany(docs, { ordered: false });
    }
    return session;
  }

  async getSession(organizationId: string, sessionId: string): Promise<INepSession> {
    const session = await NepSession.findOne({ id: sessionId, organizationId: new Types.ObjectId(organizationId), deletedAt: null });
    return session;
  }

  async updateSession(organizationId: string, sessionId: string, body: { comment?: string }): Promise<INepSession> {
    const session = await this.getSession(organizationId, sessionId);
    if (body.comment !== undefined) session.comment = body.comment;
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
      throw Object.assign(new Error('samples array is required and must not be empty'), { statusCode: 400, code: 'VALIDATION_ERROR' });
    if (samples.length > MAX_SAMPLES_PER_REQUEST)
      throw Object.assign(new Error('Maximum ' + MAX_SAMPLES_PER_REQUEST + ' samples per request'), { statusCode: 400, code: 'TOO_MANY_SAMPLES' });
    const session = await this.getSession(organizationId, sessionId);
    const docs = samples.map((s) => ({
      sessionId: session.id, organizationId: new Types.ObjectId(organizationId),
      timestamp: s.timestamp, turbidityValue: s.turbidityValue ?? null, temperatureValue: s.temperatureValue ?? null,
      probeRange: s.probeRange ?? null, locationLat: s.locationLat ?? null, locationLng: s.locationLng ?? null,
      batteryLevel: s.batteryLevel ?? null, batteryRawVoltage: s.batteryRawVoltage ?? null,
      batteryCharging: s.batteryCharging ?? null, demoModeEnabled: s.demoModeEnabled ?? null,
    }));
    const result = await NepSample.insertMany(docs, { ordered: false });
    const allSamples = await NepSample.find({ sessionId: session.id }).select('turbidityValue temperatureValue locationLat locationLng').lean();
    const stats = computeStats(allSamples);
    await NepSession.updateOne({ id: session.id }, { $set: stats });
    return { inserted: result.length };
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
        if (s.turbidityValue != null) b.turbidities.push(s.turbidityValue);
        if (s.temperatureValue != null) b.temperatures.push(s.temperatureValue);
        if (s.locationLat != null) b.lats.push(s.locationLat);
        if (s.locationLng != null) b.lngs.push(s.locationLng);
        if (s.batteryLevel != null) b.batteries.push(s.batteryLevel);
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
    return lines.join('
');
  }
}
