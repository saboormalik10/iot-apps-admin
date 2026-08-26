import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { Device } from '../models/Device';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { AuditLog } from '../models/AuditLog';
import { IngestService } from '../ingest/ingest.service';
import { parseImportTimestampMs } from './parse-import-timestamp';

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
  constructor(private readonly ingestService: IngestService) {}

  /* ─────────────────────────────────────────────────────────────────────────
   * NEP CSV IMPORT — SWITCHED OFF (M15 W4)
   *
   * NEP has no live data source: it came from the mobile apps, which are
   * disabled. Commented out rather than deleted so the contract survives if
   * water-quality data ever arrives over SFTP (M22 onboards it as a new stream
   * type instead).
   *
   * This was also the only consumer of SyncService, so disabling it lets
   * SyncModule be unregistered entirely.
   * ───────────────────────────────────────────────────────────────────────── */
//   /** Round-trips the NEP export header via the existing sync upsert (idempotent by sessionId). */
//   async importNep(organizationId: string, deviceId: string, buffer: Buffer, actor: Actor): Promise<ImportSummary> {
//     await this.assertDevice(organizationId, deviceId, 'NEP-LINK');
//
//     const rows = splitCsv(buffer.toString('utf-8'));
//     if (rows.length < 2) throw badReq('CSV is empty or has no data rows');
//     const header = rows[0].map((h) => h.toLowerCase());
//     const idx = {
//       sessionId: header.indexOf('sessionid'),
//       ts: header.indexOf('timestamp'),
//       turb: header.indexOf('turbidity_ntu'),
//       temp: header.indexOf('temperature_c'),
//       probe: header.indexOf('proberange'),
//       lat: header.indexOf('lat'),
//       lng: header.indexOf('lng'),
//       batt: header.indexOf('battery_%'),
//     };
//     if (idx.sessionId < 0 || idx.ts < 0) throw badReq('CSV header must include SessionId and Timestamp');
//
//     const errors: string[] = [];
//     let skipped = 0;
//     const bySession = new Map<string, SyncUploadPayload['samples']>();
//
//     for (let i = 1; i < rows.length; i++) {
//       const r = rows[i];
//       const sessionId = r[idx.sessionId];
//       const ts = parseImportTimestampMs(r[idx.ts]);
//       if (!sessionId || !Number.isFinite(ts)) {
//         skipped++;
//         if (errors.length < 50) errors.push(`Row ${i + 1}: missing or unparseable SessionId/Timestamp`);
//         continue;
//       }
//       const arr = bySession.get(sessionId) ?? [];
//       arr!.push({
//         timestamp: ts,
//         turbidityValue: num(r[idx.turb]),
//         temperatureValue: num(r[idx.temp]),
//         probeRange: idx.probe >= 0 ? r[idx.probe] || null : null,
//         locationLat: num(r[idx.lat]),
//         locationLng: num(r[idx.lng]),
//         batteryLevel: num(r[idx.batt]),
//       });
//       bySession.set(sessionId, arr);
//     }
//
//     let inserted = 0;
//     for (const [sessionId, samples] of bySession) {
//       const timestamps = (samples ?? []).map((s) => s.timestamp);
//       const payload: SyncUploadPayload = {
//         type: 'nep_session',
//         sessionId,
//         deviceId,
//         startTimestamp: Math.min(...timestamps),
//         endTimestamp: Math.max(...timestamps),
//         samples,
//       };
//       await this.syncService.syncUpload(organizationId, payload);
//       inserted += samples?.length ?? 0;
//     }
//
//     this.audit(organizationId, actor, 'session', `NEP import: ${bySession.size} session(s), ${inserted} sample(s)`);
//     return { inserted, upserted: bySession.size, skipped, errors };
//   }


  /**
   * MET CSV backfill — delegates to `IngestService`.
   *
   * This used to write MetRecord and MetMeasure itself and emit NOTHING, so an
   * imported file produced no realtime push, no daily summary and no alert
   * evaluation; the only repair was running the backfill script by hand. It also
   * had its own quote-unaware CSV splitter and a `Math.min(...)` spread that
   * throws past ~100k rows.
   *
   * Routing it through the ingest core fixes all of that in one move and means
   * there is exactly one parser and one write path to reason about.
   */
  /**
   * What this import WOULD do. Writes nothing.
   *
   * The wizard commits straight to the live dataset, so the two mistakes worth
   * catching first are the wrong file and the same file twice. Both are
   * answerable before the write.
   */
  async dryRunMet(organizationId: string, deviceId: string, buffer: Buffer, filename: string) {
    await this.assertDevice(organizationId, deviceId, 'MET-LINK');
    return this.ingestService.dryRunForDevice(organizationId, deviceId, buffer.toString('utf-8'), filename);
  }

  async importMet(organizationId: string, deviceId: string, buffer: Buffer, actor: Actor): Promise<ImportSummary> {
    await this.assertDevice(organizationId, deviceId, 'MET-LINK');

    const filename = `admin-upload-${Date.now()}.csv`;
    const res = await this.ingestService.ingestForDevice(organizationId, deviceId, filename, buffer.toString('utf-8'));
    const r = res.results[0];

    if (!r || r.status === 'rejected') {
      throw badReq(`Import rejected: ${r?.reason ?? 'unknown reason'}`);
    }

    this.audit(organizationId, actor, 'record', filename);

    // A byte-identical file that has already been ingested is reported as such
    // rather than silently inserting nothing. The ingest core deduplicates on
    // content hash — which the old implementation did not do at all, so a
    // double-click used to double the data.
    if (r.status === 'duplicate') {
      return {
        inserted: 0,
        upserted: 0,
        skipped: 0,
        errors: ['This exact file has already been imported — no rows were added.'],
      };
    }

    return {
      inserted: r.rows ?? 0,
      upserted: 1,
      skipped: r.skipped ?? 0,
      errors: r.warnings ? [`${r.warnings} parser warning(s) — see the ingest log`] : [],
    };
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
