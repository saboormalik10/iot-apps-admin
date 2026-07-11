import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { NepSession } from '../models/NepSession';
import { MetRecord } from '../models/MetRecord';
import { insertNewNepSamples, recomputeNepSessionStats, BulkSampleInput } from '../sessions/sessions.service';
import { MetMeasure } from '../models/MetMeasure';
import { Device } from '../models/Device';
import { FirmwareHistory } from '../models/FirmwareHistory';
import { parseMeasureSentence, isHeaderSentence, parseTimestampMs } from '../utils/measure-parser.util';
import { DomainEvent } from '../realtime/realtime.events';

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

/** Mobile-user attribution: JWT userId → ObjectId (null if absent/invalid). */
function toUserObjectId(userId?: string): Types.ObjectId | null {
  return userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
}

export interface DeviceStatusInput {
  batteryPct?: number;
  batteryVoltage?: number;
  batteryCharging?: boolean;
  firmwareVersion?: string;
  appType?: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncUploadPayload {
  type: 'nep_session' | 'met_record';
  // NEP session fields
  sessionId?: string;
  deviceId?: string;
  deviceName?: string;
  startTimestamp?: number;
  endTimestamp?: number | null;
  timezoneName?: string;
  timezoneOffset?: number;
  turbidityEnabled?: boolean;
  temperatureEnabled?: boolean;
  locationEnabled?: boolean;
  comment?: string;
  isDemoMode?: boolean;
  samples?: Array<{
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
  }>;
  // MET record fields
  recordId?: string;
  dateStart?: string;
  dateEnd?: string | null;
  urlMaps?: string | null;
  localRecordId?: number | null;
  measures?: Array<{ dataSentence: string; timeStamp: string }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SyncService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  // ── PATCH /sync/device-status — heartbeat (mobile) ────────────────────────
  async updateDeviceStatus(organizationId: string, deviceId: string, body: DeviceStatusInput, userId?: string) {
    if (!deviceId) {
      throw Object.assign(new Error('deviceId is required'), { code: 'VALIDATION_ERROR', statusCode: 400 });
    }
    const orgId = new Types.ObjectId(organizationId);
    const device = await Device.findOne({ _id: new Types.ObjectId(deviceId), organizationId: orgId, deletedAt: null });
    if (!device) {
      throw Object.assign(new Error('Device not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    const wasOffline = !(device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS);

    // Firmware change detection → append history then update device
    if (body.firmwareVersion && body.firmwareVersion !== device.firmwareVersion) {
      await FirmwareHistory.create({
        deviceId: device._id,
        organizationId: orgId,
        appType: device.type,
        previousVersion: device.firmwareVersion,
        newVersion: body.firmwareVersion,
        detectedAt: new Date(),
        detectedByAppType: body.appType ?? device.type,
      });
      device.firmwareVersion = body.firmwareVersion;
    }

    const now = new Date();
    device.lastSeenAt = now;
    device.isOnline = true;
    if (body.batteryPct !== undefined) device.lastBatteryPct = body.batteryPct;
    if (body.batteryVoltage !== undefined) device.lastBatteryVoltage = body.batteryVoltage;
    if (body.batteryCharging !== undefined) device.lastBatteryCharging = body.batteryCharging;
    const heartbeatUser = toUserObjectId(userId);
    if (heartbeatUser) device.lastSeenByUserId = heartbeatUser;
    await device.save();

    this.eventEmitter.emit(DomainEvent.DEVICE_STATUS, {
      organizationId,
      deviceId,
      deviceName: device.customName ?? device.name,
      isOnline: true,
      lastSeenAt: now,
      batteryPct: device.lastBatteryPct,
      justConnected: wasOffline,
    });

    // Month 6: let the notifications listener compare against the org firmware target.
    if (body.firmwareVersion) {
      this.eventEmitter.emit(DomainEvent.DEVICE_FIRMWARE_REPORTED, {
        organizationId,
        deviceId,
        deviceName: device.customName ?? device.name,
        deviceType: device.type,
        firmwareVersion: device.firmwareVersion,
      });
    }

    return {
      deviceId,
      lastSeenAt: now,
      isOnline: true,
      firmwareVersion: device.firmwareVersion,
      batteryPct: device.lastBatteryPct,
    };
  }

  async getSyncStatus(organizationId: string, deviceId?: string) {
    const orgId = new Types.ObjectId(organizationId);
    const baseMatch: Record<string, unknown> = { organizationId: orgId };
    if (deviceId) baseMatch.deviceId = new Types.ObjectId(deviceId);

    const [nepSessionCount, metRecordCount, lastNepSession, lastMetRecord] = await Promise.all([
      NepSession.countDocuments({ ...baseMatch, deletedAt: null }),
      MetRecord.countDocuments({ ...baseMatch, deletedAt: null }),
      NepSession.findOne({ ...baseMatch, deletedAt: null })
        .sort({ syncedAt: -1 })
        .select('id deviceName syncedAt sampleCount')
        .lean(),
      MetRecord.findOne({ ...baseMatch, deletedAt: null })
        .sort({ syncedAt: -1 })
        .select('deviceName dateStart syncedAt measureCount')
        .lean(),
    ]);

    return {
      organizationId,
      deviceId: deviceId ?? null,
      nepSessions: { total: nepSessionCount, lastSyncedAt: lastNepSession?.syncedAt ?? null, lastSession: lastNepSession ?? null },
      metRecords: { total: metRecordCount, lastSyncedAt: lastMetRecord?.syncedAt ?? null, lastRecord: lastMetRecord ?? null },
      serverTime: new Date().toISOString(),
    };
  }

  async syncUpload(organizationId: string, payload: SyncUploadPayload, userId?: string) {
    if (!payload.type) {
      throw Object.assign(new Error('type is required: "nep_session" or "met_record"'), { code: 'VALIDATION_ERROR', statusCode: 400 });
    }
    if (payload.type === 'nep_session') {
      return this._upsertNepSession(organizationId, payload, userId);
    }
    return this._upsertMetRecord(organizationId, payload, userId);
  }

  async syncDownload(organizationId: string, deviceId: string, since?: number) {
    const orgId = new Types.ObjectId(organizationId);
    const deviceObjId = new Types.ObjectId(deviceId);
    const sinceDate = since ? new Date(since) : new Date(0);

    const device = await Device.findOne({ _id: deviceObjId, organizationId: orgId, deletedAt: null }).lean();
    if (!device) {
      throw Object.assign(new Error('Device not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    const [nepSessions, metRecords] = await Promise.all([
      device.type === 'NEP-LINK'
        ? NepSession.find({ deviceId: deviceObjId, organizationId: orgId, syncedAt: { $gte: sinceDate }, deletedAt: null })
            .sort({ startTimestamp: -1 })
            .limit(100)
            .lean()
        : [],
      device.type === 'MET-LINK'
        ? MetRecord.find({ deviceId: deviceObjId, organizationId: orgId, syncedAt: { $gte: sinceDate }, deletedAt: null })
            .sort({ dateStartMs: -1 })
            .limit(100)
            .lean()
        : [],
    ]);

    return {
      device: { id: device._id, name: device.name, type: device.type },
      since: sinceDate.toISOString(),
      nepSessions,
      metRecords,
    };
  }

  private async _upsertNepSession(organizationId: string, payload: SyncUploadPayload, userId?: string) {
    if (!payload.sessionId || !payload.deviceId || !payload.startTimestamp) {
      throw Object.assign(
        new Error('sessionId, deviceId and startTimestamp are required for nep_session'),
        { code: 'VALIDATION_ERROR', statusCode: 400 },
      );
    }

    const orgId = new Types.ObjectId(organizationId);

    const device = await Device.findOne({
      _id: new Types.ObjectId(payload.deviceId),
      organizationId: orgId,
      deletedAt: null,
    }).lean();
    if (!device) {
      throw Object.assign(new Error('Device not found in organisation'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    const samples = payload.samples ?? [];
    const now = new Date();

    // Metadata only — the sample-derived stats (sampleCount, aggregates,
    // hasGpsData, probeRange) are recomputed from the STORED samples below, so a
    // metadata-only re-upload can't wipe them and a retried upload can't
    // double-count them.
    const sessionData = {
      organizationId: orgId,
      deviceId: new Types.ObjectId(payload.deviceId),
      userId: toUserObjectId(userId),
      deviceName: payload.deviceName ?? device.name,
      startTimestamp: payload.startTimestamp,
      endTimestamp: payload.endTimestamp ?? null,
      timezoneName: payload.timezoneName ?? 'UTC',
      timezoneOffset: payload.timezoneOffset ?? 0,
      turbidityEnabled: payload.turbidityEnabled ?? true,
      temperatureEnabled: payload.temperatureEnabled ?? true,
      locationEnabled: payload.locationEnabled ?? false,
      comment: payload.comment ?? '',
      isDemoMode: payload.isDemoMode ?? false,
      syncedAt: now,
    };

    const prev = await NepSession.findOne({ id: payload.sessionId }).select('endTimestamp').lean();
    const existed = !!prev;

    await NepSession.findOneAndUpdate(
      { id: payload.sessionId, organizationId: orgId },
      { $set: sessionData, $setOnInsert: { id: payload.sessionId, createdAt: now } },
      { upsert: true, new: true },
    );

    // Retry-safe: only samples with a NEW timestamp are inserted (a re-sent
    // payload inserts nothing), then stats reflect everything actually stored.
    const samplesInserted = await insertNewNepSamples(payload.sessionId, orgId, samples);
    const stats = await recomputeNepSessionStats(payload.sessionId);
    const session = await NepSession.findOne({ id: payload.sessionId, organizationId: orgId });

    const deviceIdStr = (payload.deviceId as string);
    if (!existed) {
      this.eventEmitter.emit(DomainEvent.NEP_SESSION_CREATED, {
        organizationId,
        deviceId: deviceIdStr,
        sessionId: payload.sessionId,
        startTimestamp: payload.startTimestamp,
        probeRange: stats.probeRange,
      });
    }
    if (samples.length > 0) {
      const last = samples[samples.length - 1];
      this.eventEmitter.emit(DomainEvent.NEP_SAMPLE, {
        organizationId,
        deviceId: deviceIdStr,
        sessionId: payload.sessionId,
        sample: {
          timestamp: last.timestamp,
          turbidityValue: last.turbidityValue ?? null,
          temperatureValue: last.temperatureValue ?? null,
          probeRange: last.probeRange ?? stats.probeRange,
        },
      });
    }

    // Month 6: session-complete notification when endTimestamp first becomes non-null.
    const newlyComplete = payload.endTimestamp != null && (!prev || prev.endTimestamp == null);
    if (newlyComplete) {
      this.eventEmitter.emit(DomainEvent.NEP_SESSION_COMPLETED, {
        organizationId,
        deviceId: deviceIdStr,
        deviceName: session?.deviceName ?? sessionData.deviceName,
        sessionId: payload.sessionId,
        sampleCount: stats.sampleCount,
      });
    }

    return { type: 'nep_session', session, samplesInserted };
  }

  private async _upsertMetRecord(organizationId: string, payload: SyncUploadPayload, userId?: string) {
    if (!payload.deviceId || !payload.dateStart) {
      throw Object.assign(
        new Error('deviceId and dateStart are required for met_record'),
        { code: 'VALIDATION_ERROR', statusCode: 400 },
      );
    }

    const orgId = new Types.ObjectId(organizationId);

    const device = await Device.findOne({
      _id: new Types.ObjectId(payload.deviceId),
      organizationId: orgId,
      deletedAt: null,
    }).lean();
    if (!device) {
      throw Object.assign(new Error('Device not found in organisation'), { code: 'NOT_FOUND', statusCode: 404 });
    }

    const dateStartMs = parseTimestampMs(payload.dateStart);
    const dateEndMs = payload.dateEnd ? parseTimestampMs(payload.dateEnd) : null;
    const now = new Date();

    const recordData = {
      organizationId: orgId,
      deviceId: new Types.ObjectId(payload.deviceId),
      userId: toUserObjectId(userId),
      deviceName: payload.deviceName ?? device.name,
      dateStart: payload.dateStart,
      dateEnd: payload.dateEnd ?? null,
      dateStartMs,
      dateEndMs,
      comment: payload.comment ?? '',
      urlMaps: payload.urlMaps ?? null,
      localRecordId: payload.localRecordId ?? null,
      isDemoMode: payload.isDemoMode ?? false,
      syncedAt: now,
    };

    const filter = payload.localRecordId != null
      ? { organizationId: orgId, localRecordId: payload.localRecordId }
      : { organizationId: orgId, deviceId: new Types.ObjectId(payload.deviceId), dateStartMs };

    const record = await MetRecord.findOneAndUpdate(
      filter,
      { $set: recordData, $setOnInsert: { createdAt: now, hasHeaderRow: true, measureCount: 0 } },
      { upsert: true, new: true },
    );

    const measures = payload.measures ?? [];
    let insertedCount = 0;
    if (measures.length > 0) {
      const docs = measures.map((m) => {
        const isHeader = isHeaderSentence(m.dataSentence);
        const parsed = parseMeasureSentence(m.dataSentence);
        const tsMs = parseTimestampMs(m.timeStamp);
        return {
          recordId: record._id,
          organizationId: orgId,
          rowType: isHeader ? 'header' as const : 'data' as const,
          dataSentence: m.dataSentence,
          timeStamp: m.timeStamp,
          timestampMs: tsMs,
          windSpeedMs: parsed.windSpeedMs,
          windSpeedKmh: parsed.windSpeedKmh,
          windSpeedKnots: parsed.windSpeedKnots,
          windSpeedRelMs: parsed.windSpeedRelMs,
          windSpeedTrueMs: parsed.windSpeedTrueMs,
          windDirRelDeg: parsed.windDirRelDeg,
          windDirTrueDeg: parsed.windDirTrueDeg,
          tempC: parsed.tempC,
          humidityPct: parsed.humidityPct,
          pressureHpa: parsed.pressureHpa,
          precipMm: parsed.precipMm,
          precipRateMmHr: parsed.precipRateMmHr,
          solarWm2: parsed.solarWm2,
          voltageV: parsed.voltageV,
          batteryVoltageV: parsed.batteryVoltageV,
          currentA: parsed.currentA,
          dewPointC: parsed.dewPointC,
          qnhHpa: parsed.qnhHpa,
          qfeHpa: parsed.qfeHpa,
          gpsLat: parsed.gpsLat,
          gpsLng: parsed.gpsLng,
          gpsAltM: parsed.gpsAltM,
          gpsSatellites: parsed.gpsSatellites,
          gpsHorDilution: parsed.gpsHorDilution,
          gpsGeoidalSepM: parsed.gpsGeoidalSepM,
          gpsQuality: parsed.gpsQuality,
          phoneLat: parsed.phoneLat,
          phoneLng: parsed.phoneLng,
          isDemoMode: payload.isDemoMode ?? false,
        };
      });
      await MetMeasure.insertMany(docs, { ordered: false });
      const dataCount = docs.filter((d) => d.rowType === 'data').length;
      await MetRecord.updateOne({ _id: record._id }, { $inc: { measureCount: dataCount } });
      insertedCount = docs.length;

      const dataRows = docs.filter((d) => d.rowType === 'data');
      if (dataRows.length) {
        const last = dataRows.reduce((a, b) => (b.timestampMs > a.timestampMs ? b : a));
        this.eventEmitter.emit(DomainEvent.MET_MEASURES, {
          organizationId,
          deviceId: payload.deviceId,
          recordId: (record._id as Types.ObjectId).toString(),
          latest: {
            measuredAtMs: last.timestampMs,
            windSpeedMs: last.windSpeedMs,
            windSpeedKmh: last.windSpeedKmh,
            windDirTrueDeg: last.windDirTrueDeg,
            tempC: last.tempC,
            humidityPct: last.humidityPct,
            pressureHpa: last.pressureHpa,
            dewPointC: last.dewPointC,
          },
        });
      }
    }

    return { type: 'met_record', record, measuresInserted: insertedCount };
  }
}
