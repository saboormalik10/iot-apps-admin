import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { Device } from '../models/Device';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { AuditLog } from '../models/AuditLog';
import { SyncService, SyncUploadPayload } from '../sync/sync.service';
import { parseTimestampMs } from '../utils/measure-parser.util';

type Actor = { userId: string; email: string };

export interface ImportSummary {
  inserted: number;
  upserted: number;
  skipped: number;
  errors: string[];
}

const badReq = (msg: string) => Object.assign(new Error(msg), { statusCode: 400, code: 'VALIDATION_ERROR' });

function splitCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(',').map((c) => c.trim()));
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

@Injectable()
export class ImportService {
  constructor(private readonly syncService: SyncService) {}

  /** Round-trips the NEP export header via the existing sync upsert (idempotent by sessionId). */
  async importNep(organizationId: string, deviceId: string, buffer: Buffer, actor: Actor): Promise<ImportSummary> {
    await this.assertDevice(organizationId, deviceId, 'NEP-LINK');

    const rows = splitCsv(buffer.toString('utf-8'));
    if (rows.length < 2) throw badReq('CSV is empty or has no data rows');
    const header = rows[0].map((h) => h.toLowerCase());
    const idx = {
      sessionId: header.indexOf('sessionid'),
      ts: header.indexOf('timestamp'),
      turb: header.indexOf('turbidity_ntu'),
      temp: header.indexOf('temperature_c'),
      probe: header.indexOf('proberange'),
      lat: header.indexOf('lat'),
      lng: header.indexOf('lng'),
      batt: header.indexOf('battery_%'),
    };
    if (idx.sessionId < 0 || idx.ts < 0) throw badReq('CSV header must include SessionId and Timestamp');

    const errors: string[] = [];
    let skipped = 0;
    const bySession = new Map<string, SyncUploadPayload['samples']>();

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const sessionId = r[idx.sessionId];
      const ts = num(r[idx.ts]);
      if (!sessionId || ts === null) {
        skipped++;
        if (errors.length < 50) errors.push(`Row ${i + 1}: missing SessionId/Timestamp`);
        continue;
      }
      const arr = bySession.get(sessionId) ?? [];
      arr!.push({
        timestamp: ts,
        turbidityValue: num(r[idx.turb]),
        temperatureValue: num(r[idx.temp]),
        probeRange: idx.probe >= 0 ? r[idx.probe] || null : null,
        locationLat: num(r[idx.lat]),
        locationLng: num(r[idx.lng]),
        batteryLevel: num(r[idx.batt]),
      });
      bySession.set(sessionId, arr);
    }

    let inserted = 0;
    for (const [sessionId, samples] of bySession) {
      const timestamps = (samples ?? []).map((s) => s.timestamp);
      const payload: SyncUploadPayload = {
        type: 'nep_session',
        sessionId,
        deviceId,
        startTimestamp: Math.min(...timestamps),
        endTimestamp: Math.max(...timestamps),
        samples,
      };
      await this.syncService.syncUpload(organizationId, payload);
      inserted += samples?.length ?? 0;
    }

    this.audit(organizationId, actor, 'session', `NEP import: ${bySession.size} session(s), ${inserted} sample(s)`);
    return { inserted, upserted: bySession.size, skipped, errors };
  }

  /** MET export columns are already parsed → write MetRecord + MetMeasure rows directly. */
  async importMet(organizationId: string, deviceId: string, buffer: Buffer, actor: Actor): Promise<ImportSummary> {
    const device = await this.assertDevice(organizationId, deviceId, 'MET-LINK');

    const rows = splitCsv(buffer.toString('utf-8'));
    if (rows.length < 2) throw badReq('CSV is empty or has no data rows');
    const header = rows[0].map((h) => h.toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const iTs = col('timestamp');
    if (iTs < 0) throw badReq('CSV header must include Timestamp');
    const map: Record<string, number> = {
      tempC: col('temp_c'),
      humidityPct: col('humidity_%'),
      pressureHpa: col('pressure_hpa'),
      windSpeedMs: col('windspeed_ms'),
      windSpeedKmh: col('windspeed_kmh'),
      windDirTrueDeg: col('winddir_deg'),
      dewPointC: col('dewpoint_c'),
      precipMm: col('precip_mm'),
      solarWm2: col('solar_wm2'),
      voltageV: col('voltage_v'),
      gpsLat: col('lat'),
      gpsLng: col('lng'),
    };

    const errors: string[] = [];
    let skipped = 0;
    const orgId = new Types.ObjectId(organizationId);
    const tsList: number[] = [];
    const measures: Record<string, unknown>[] = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const tsStr = r[iTs];
      const tsMs = tsStr ? parseTimestampMs(tsStr) : NaN;
      if (!tsStr || !Number.isFinite(tsMs)) {
        skipped++;
        if (errors.length < 50) errors.push(`Row ${i + 1}: bad Timestamp`);
        continue;
      }
      tsList.push(tsMs);
      const pick = (k: string) => (map[k] >= 0 ? num(r[map[k]]) : null);
      measures.push({
        organizationId: orgId,
        rowType: 'data',
        dataSentence: r.join(','),
        timeStamp: tsStr,
        timestampMs: tsMs,
        tempC: pick('tempC'),
        humidityPct: pick('humidityPct'),
        pressureHpa: pick('pressureHpa'),
        windSpeedMs: pick('windSpeedMs'),
        windSpeedKmh: pick('windSpeedKmh'),
        windDirTrueDeg: pick('windDirTrueDeg'),
        dewPointC: pick('dewPointC'),
        precipMm: pick('precipMm'),
        solarWm2: pick('solarWm2'),
        voltageV: pick('voltageV'),
        gpsLat: pick('gpsLat'),
        gpsLng: pick('gpsLng'),
        isDemoMode: false,
      });
    }
    if (measures.length === 0) throw badReq('No valid data rows found');

    const dateStartMs = Math.min(...tsList);
    const dateEndMs = Math.max(...tsList);
    const now = new Date();
    const record = await MetRecord.create({
      organizationId: orgId,
      deviceId: new Types.ObjectId(deviceId),
      deviceName: device.name,
      dateStart: new Date(dateStartMs).toISOString(),
      dateEnd: new Date(dateEndMs).toISOString(),
      dateStartMs,
      dateEndMs,
      comment: 'Imported (CSV backfill)',
      measureCount: measures.length,
      hasHeaderRow: true,
      syncedAt: now,
      isDemoMode: false,
    });
    await MetMeasure.insertMany(
      measures.map((m) => ({ ...m, recordId: record._id })),
      { ordered: false },
    );

    this.audit(organizationId, actor, 'record', `MET import: ${measures.length} measure(s)`);
    return { inserted: measures.length, upserted: 1, skipped, errors };
  }

  private async assertDevice(organizationId: string, deviceId: string, type: 'MET-LINK' | 'NEP-LINK') {
    if (!deviceId || !Types.ObjectId.isValid(deviceId)) throw badReq('A valid deviceId is required');
    const device = await Device.findOne({
      _id: new Types.ObjectId(deviceId),
      organizationId: new Types.ObjectId(organizationId),
      deletedAt: null,
    }).lean();
    if (!device) throw Object.assign(new Error('Device not found'), { statusCode: 404, code: 'NOT_FOUND' });
    if (device.type !== type) throw badReq(`Device is not a ${type}`);
    return device;
  }

  private audit(organizationId: string, actor: Actor, resourceType: 'session' | 'record', name: string): void {
    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      action: 'create',
      resourceType,
      resourceId: null,
      resourceName: name,
      changes: null,
    }).catch(() => void 0);
  }
}
