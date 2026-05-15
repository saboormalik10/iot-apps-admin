import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { MetRecord, IMetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { Device } from '../models/Device';
import { AuditLog } from '../models/AuditLog';
import { parseMeasureSentence, isHeaderSentence, parseTimestampMs } from '../utils/measure-parser.util';

export interface ListRecordsOptions {
  organizationId: string;
  deviceId?: string;
  from?: number;
  to?: number;
  page?: number;
  limit?: number;
}

export interface CreateRecordInput {
  deviceId: string;
  deviceName?: string;
  dateStart: string;
  dateEnd?: string | null;
  comment?: string;
  urlMaps?: string | null;
  localRecordId?: number | null;
  isDemoMode?: boolean;
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

@Injectable()
export class RecordsService {
  async listRecords(opts: ListRecordsOptions) {
    const { organizationId, deviceId, from, to, page = 1, limit = 20 } = opts;
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), deletedAt: null };
    if (deviceId) query.deviceId = new Types.ObjectId(deviceId);
    if (from || to) {
      query.dateStartMs = {};
      if (from) (query.dateStartMs as Record<string, number>).$gte = from;
      if (to) (query.dateStartMs as Record<string, number>).$lte = to;
    }
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      MetRecord.find(query).sort({ dateStartMs: -1 }).skip(skip).limit(limit).lean(),
      MetRecord.countDocuments(query),
    ]);
    return { data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
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
      deviceName: input.deviceName ?? device.name, dateStart: input.dateStart, dateEnd: input.dateEnd ?? null,
      dateStartMs, dateEndMs, comment: input.comment ?? '', measureCount: 0, hasHeaderRow: true,
      localRecordId: input.localRecordId ?? null, isDemoMode: input.isDemoMode ?? false,
      urlMaps: input.urlMaps ?? null, syncedAt: new Date(),
    });
    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId), userId: new Types.ObjectId(actor.userId), userEmail: actor.email,
      action: 'create', resourceType: 'record', resourceId: (record._id as unknown as string).toString(),
      resourceName: record.deviceName + ' — ' + record.dateStart, changes: null,
    }).catch(() => {});
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
        phoneLat: parsed.phoneLat, phoneLng: parsed.phoneLng, isDemoMode: record.isDemoMode,
      };
    });
    await MetMeasure.insertMany(docs, { ordered: false });
    const dataCount = docs.filter((d) => d.rowType === 'data').length;
    await MetRecord.updateOne({ _id: new Types.ObjectId(recordId) }, { $inc: { measureCount: dataCount } });
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
