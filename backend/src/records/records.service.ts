import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Document, Types } from 'mongoose';
import { MetRecord, IMetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { Device } from '../models/Device';
import { AuditLog } from '../models/AuditLog';
import { parseMeasureSentence, isHeaderSentence, parseTimestampMs } from '../utils/measure-parser.util';
import { DomainEvent } from '../realtime/realtime.events';

export interface ListRecordsOptions {
  organizationId: string;
  deviceId?: string;
  from?: number;
  to?: number;
  page?: number;
  limit?: number;
  /** true → demo-device records ONLY; false/undefined → real-device records only. */
}

export interface CreateRecordInput {
  deviceId: string;
  deviceName?: string;
  dateStart: string;
  dateEnd?: string | null;
  comment?: string;
  urlMaps?: string | null;
  localRecordId?: number | null;
}

export interface MeasureInput {
  dataSentence: string;
  timeStamp: string;
}

export interface ListMeasuresOptions {
  organizationId: string;
  recordId: string;
  page?: number;
  limit?: number;
}

/**
 * One row of the records list.
 *
 * `IMetRecord` extends Mongoose's `Document`, so it carries the document
 * METHODS as well as the fields. `.lean()` returns plain objects, and spreading
 * one to add a derived field drops those methods — hence the data-only shape.
 */
type LeanRecord = Omit<IMetRecord, keyof Document> & { _id: Types.ObjectId };
export type ListedRecord = LeanRecord & { measuresInRange?: number };
export interface ListRecordsResult {
  data: ListedRecord[];
  meta: { page: number; limit: number; total: number; pages: number };
}

@Injectable()
export class RecordsService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async listRecords(opts: ListRecordsOptions): Promise<ListRecordsResult> {
    const { organizationId, deviceId, from, to, page = 1, limit = 20 } = opts;
    const orgId = new Types.ObjectId(organizationId);
    const query: Record<string, unknown> = {
      organizationId: orgId,
      deletedAt: null,
      // Demo/real is decided by the device that recorded it.
    };
    if (deviceId) query.deviceId = new Types.ObjectId(deviceId);
    if (from || to) {
      /**
       * OVERLAP, not containment.
       *
       * A `MetRecord` is one document per station per LOCAL DAY, so it SPANS
       * hours — the open one starts at local midnight and runs until the station
       * stops. Matching `dateStartMs` against the window asked "did the day
       * BEGIN inside it?", which is false for every range shorter than a day:
       * `?range=1h` returned nothing while the current day's record held that
       * exact hour.
       *
       * A record is in range when it overlaps the window. `dateEndMs: null` is
       * the still-open day and must always be included, or the newest record —
       * the one anybody looking at a recent range actually wants — is the single
       * row that never matches. This mirrors `metRecordIds` in
       * analytics.service.ts, which already resolved records this way.
       */
      if (to) query.dateStartMs = { $lte: to };
      if (from) query.$or = [{ dateEndMs: null }, { dateEndMs: { $gte: from } }];
    }
    const skip = (page - 1) * limit;
    // The lean shape is spelled out rather than inferred: adding a derived field
    // below pushed the inferred type past what TypeScript will serialize
    // (TS7056), and an explicit row type is clearer than the alternative anyway.
    const [items, total] = await Promise.all([
      MetRecord.find(query)
        .sort({ dateStartMs: -1 })
        .skip(skip)
        .limit(limit)
        .lean<LeanRecord[]>(),
      MetRecord.countDocuments(query),
    ]);

    /**
     * How many of each record's readings fall INSIDE the requested window.
     *
     * A record is one document per station per local DAY, so a window narrower
     * than a day selects the whole day's record and the row then reported the
     * whole day: picking "last hour" showed 8,636 measures. The filter was
     * right; the number beside it was answering a different question.
     *
     * Counted only for the records on THIS page (at most `limit`), and only when
     * a window was actually given, so the cost is bounded and absent when there
     * is nothing to qualify. Served by the existing
     * `recordId_1_rowType_1_timestampMs_-1` index — measured at ~80ms.
     */
    let inRange: Map<string, number> | null = null;
    if ((from || to) && items.length) {
      const span: Record<string, number> = {};
      if (from) span.$gte = from;
      if (to) span.$lte = to;
      const rows = await MetMeasure.aggregate<{ _id: Types.ObjectId; n: number }>([
        {
          $match: {
            recordId: { $in: items.map((r) => r._id as Types.ObjectId) },
            rowType: 'data',
            timestampMs: span,
          },
        },
        { $group: { _id: '$recordId', n: { $sum: 1 } } },
      ]);
      inRange = new Map(rows.map((r) => [String(r._id), r.n]));
    }

    const data = items.map((r) =>
      inRange === null
        ? r
        : // A record with no rows in the window reports 0 rather than being
          // omitted — it still overlaps the range, and "0 in range" is the
          // answer to why it looks empty.
          { ...r, measuresInRange: inRange.get(String(r._id)) ?? 0 },
    );

    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async createRecord(organizationId: string, input: CreateRecordInput, actor: { userId: string; email: string }) {
    const device = await Device.findOne({ _id: new Types.ObjectId(input.deviceId), organizationId: new Types.ObjectId(organizationId), deletedAt: null }).lean();
    if (!device) {
      const err = new Error('Device not found in organisation');
      (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
      throw err;
    }
    if (input.localRecordId != null) {
      const existing = await MetRecord.findOne({ organizationId: new Types.ObjectId(organizationId), localRecordId: input.localRecordId }).lean();
      if (existing) return existing;
    }
    const dateStartMs = parseTimestampMs(input.dateStart);
    const dateEndMs = input.dateEnd ? parseTimestampMs(input.dateEnd) : null;
    const record = await MetRecord.create({
      organizationId: new Types.ObjectId(organizationId), deviceId: new Types.ObjectId(input.deviceId),
      userId: Types.ObjectId.isValid(actor.userId) ? new Types.ObjectId(actor.userId) : null,
      deviceName: input.deviceName ?? device.name, dateStart: input.dateStart, dateEnd: input.dateEnd ?? null,
      dateStartMs, dateEndMs, comment: input.comment ?? '', measureCount: 0, hasHeaderRow: true,
      localRecordId: input.localRecordId ?? null,
      urlMaps: input.urlMaps ?? null, syncedAt: new Date(),
    });
    // Only audit real users — a mobile/API-key actor ('mobile-device') is not an
    // ObjectId and `new Types.ObjectId(actor.userId)` would throw synchronously
    // (escaping the .catch) and 500 the request, same as the createDevice bug.
    if (Types.ObjectId.isValid(actor.userId)) {
      AuditLog.create({
        organizationId: new Types.ObjectId(organizationId), userId: new Types.ObjectId(actor.userId), userEmail: actor.email,
        action: 'create', resourceType: 'record', resourceId: (record._id as unknown as string).toString(),
        resourceName: record.deviceName + ' — ' + record.dateStart, changes: null,
      }).catch(() => {});
    }
    return record;
  }

  async getRecord(organizationId: string, recordId: string) {
    const record = await MetRecord.findOne({ _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), deletedAt: null }).lean();
    if (!record) {
      const err = new Error('Record not found');
      (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
      throw err;
    }
    return record;
  }

  async updateRecord(organizationId: string, recordId: string, body: { comment?: string }) {
    const record = await MetRecord.findOneAndUpdate(
      { _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), deletedAt: null },
      { $set: { comment: body.comment ?? '' } },
      { new: true },
    ).lean();
    if (!record) {
      const err = new Error('Record not found');
      (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
      throw err;
    }
    return record;
  }

  async deleteRecord(organizationId: string, recordId: string, actor: { userId: string; email: string }) {
    const record = await MetRecord.findOne({ _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), deletedAt: null }).lean();
    if (!record) {
      const err = new Error('Record not found');
      (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
      throw err;
    }
    await MetMeasure.deleteMany({ recordId: new Types.ObjectId(recordId) });
    await MetRecord.updateOne({ _id: new Types.ObjectId(recordId) }, { $set: { deletedAt: new Date() } });
    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId), userId: new Types.ObjectId(actor.userId), userEmail: actor.email,
      action: 'delete', resourceType: 'record', resourceId: (record._id as unknown as string).toString(),
      resourceName: record.deviceName + ' — ' + record.dateStart, changes: null,
    }).catch(() => {});
  }

  async getMeasures(opts: ListMeasuresOptions) {
    const { organizationId, recordId, page = 1, limit = 1000 } = opts;
    await this.getRecord(organizationId, recordId);
    const skip = (page - 1) * limit;
    const query = { recordId: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId) };
    const [items, total] = await Promise.all([
      MetMeasure.find(query).sort({ timestampMs: 1 }).skip(skip).limit(limit).lean(),
      MetMeasure.countDocuments(query),
    ]);
    return { data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async bulkInsertMeasures(organizationId: string, recordId: string, measures: MeasureInput[]) {
    if (!Array.isArray(measures) || measures.length === 0) {
      const err = new Error('measures array is required and must not be empty');
      (err as NodeJS.ErrnoException).code = 'VALIDATION_ERROR';
      throw err;
    }
    const record = await MetRecord.findOne({ _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), deletedAt: null }).lean();
    if (!record) {
      const err = new Error('Record not found');
      (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
      throw err;
    }
    const docs = measures.map((m) => {
      const isHeader = isHeaderSentence(m.dataSentence);
      const parsed = parseMeasureSentence(m.dataSentence);
      const tsMs = parseTimestampMs(m.timeStamp);
      return {
        recordId: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId),
        rowType: isHeader ? 'header' as const : 'data' as const, dataSentence: m.dataSentence,
        timeStamp: m.timeStamp, timestampMs: tsMs, windSpeedMs: parsed.windSpeedMs,
        windSpeedKmh: parsed.windSpeedKmh, windSpeedKnots: parsed.windSpeedKnots,
        windSpeedRelMs: parsed.windSpeedRelMs, windSpeedTrueMs: parsed.windSpeedTrueMs,
        windDirRelDeg: parsed.windDirRelDeg, windDirTrueDeg: parsed.windDirTrueDeg,
        tempC: parsed.tempC, humidityPct: parsed.humidityPct, pressureHpa: parsed.pressureHpa,
        precipMm: parsed.precipMm, precipRateMmHr: parsed.precipRateMmHr, solarWm2: parsed.solarWm2,
        voltageV: parsed.voltageV, batteryVoltageV: parsed.batteryVoltageV, currentA: parsed.currentA,
        dewPointC: parsed.dewPointC, qnhHpa: parsed.qnhHpa, qfeHpa: parsed.qfeHpa,
        gpsLat: parsed.gpsLat, gpsLng: parsed.gpsLng, gpsAltM: parsed.gpsAltM,
        gpsSatellites: parsed.gpsSatellites, gpsHorDilution: parsed.gpsHorDilution,
        gpsGeoidalSepM: parsed.gpsGeoidalSepM, gpsQuality: parsed.gpsQuality,
        phoneLat: parsed.phoneLat, phoneLng: parsed.phoneLng,
      };
    });
    await MetMeasure.insertMany(docs, { ordered: false });
    const dataCount = docs.filter((d) => d.rowType === 'data').length;
    await MetRecord.updateOne({ _id: new Types.ObjectId(recordId) }, { $inc: { measureCount: dataCount } });

    const dataRows = docs.filter((d) => d.rowType === 'data');
    if (dataRows.length) {
      const last = dataRows.reduce((a, b) => (b.timestampMs > a.timestampMs ? b : a));
      this.eventEmitter.emit(DomainEvent.MET_MEASURES, {
        organizationId,
        deviceId: (record.deviceId as Types.ObjectId).toString(),
        recordId,
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

    return { inserted: docs.length, dataRows: dataCount, headerRows: docs.length - dataCount };
  }

  async exportRecordCsv(organizationId: string, recordId: string): Promise<string> {
    const record = await this.getRecord(organizationId, recordId);
    const measures = await MetMeasure.find({ recordId: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId) }).sort({ timestampMs: 1 }).lean();
    if (measures.length === 0) return '';
    const header = measures[0];
    const lines: string[] = ['Timestamp,' + header.dataSentence + ',Comment:,' + (record.comment ?? '')];
    for (const m of measures.slice(1)) {
      lines.push(m.timeStamp + ',' + m.dataSentence);
    }
    return lines.join('\n');
  }
}
