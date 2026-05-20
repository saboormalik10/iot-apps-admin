import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { Device } from '../models/Device';
import { parseMeasureSentence, isHeaderSentence, parseTimestampMs } from '../utils/measure-parser.util';

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

  async syncUpload(organizationId: string, payload: SyncUploadPayload) {
    if (!payload.type) {
      throw Object.assign(new Error('type is required: "nep_session" or "met_record"'), { code: 'VALIDATION_ERROR', statusCode: 400 });
    }
    if (payload.type === 'nep_session') {
      return this._upsertNepSession(organizationId, payload);
    }
    return this._upsertMetRecord(organizationId, payload);
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

  private async _upsertNepSession(organizationId: string, payload: SyncUploadPayload) {
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
    const turbValues = samples.map((s) => s.turbidityValue).filter((v): v is number => v != null);
    const tempValues = samples.map((s) => s.temperatureValue).filter((v): v is number => v != null);
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    let probeRange: string | null = null;
    for (const s of samples) {
      if (s.turbidityValue != null) {
        probeRange = s.turbidityValue < 10 ? 'R1' : s.turbidityValue <= 1000 ? 'R2' : 'R3';
        break;
      }
    }

    const now = new Date();
    const sessionData = {
      organizationId: orgId,
      deviceId: new Types.ObjectId(payload.deviceId),
      deviceName: payload.deviceName ?? device.name,
      startTimestamp: payload.startTimestamp,
      endTimestamp: payload.endTimestamp ?? null,
      timezoneName: payload.timezoneName ?? 'UTC',
      timezoneOffset: payload.timezoneOffset ?? 0,
      probeRange,
      turbidityEnabled: payload.turbidityEnabled ?? true,
      temperatureEnabled: payload.temperatureEnabled ?? true,
      locationEnabled: payload.locationEnabled ?? false,
      comment: payload.comment ?? '',
      sampleCount: samples.length,
      turbidityAvg: avg(turbValues),
      turbidityMin: turbValues.length ? Math.min(...turbValues) : null,
      turbidityMax: turbValues.length ? Math.max(...turbValues) : null,
      temperatureAvg: avg(tempValues),
      temperatureMin: tempValues.length ? Math.min(...tempValues) : null,
      temperatureMax: tempValues.length ? Math.max(...tempValues) : null,
      hasTempData: tempValues.length > 0,
      hasGpsData: samples.some((s) => s.locationLat != null),
      isDemoMode: payload.isDemoMode ?? false,
      syncedAt: now,
    };

    const session = await NepSession.findOneAndUpdate(
      { id: payload.sessionId, organizationId: orgId },
      { $set: sessionData, $setOnInsert: { id: payload.sessionId, createdAt: now } },
      { upsert: true, new: true },
    );

    if (samples.length > 0) {
      const sampleDocs = samples.map((s) => ({
        sessionId: payload.sessionId,
        organizationId: orgId,
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
      }));
      await NepSample.insertMany(sampleDocs, { ordered: false });
    }

    return { type: 'nep_session', session, samplesInserted: samples.length };
  }

  private async _upsertMetRecord(organizationId: string, payload: SyncUploadPayload) {
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
    }

    return { type: 'met_record', record, measuresInserted: insertedCount };
  }
}
