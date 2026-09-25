import { Injectable } from '@nestjs/common';
import { Document, Types, type PipelineStage } from 'mongoose';
import { MetRecord, IMetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { AuditLog } from '../models/AuditLog';

export interface ListRecordsOptions {
  organizationId: string;
  deviceId?: string;
  from?: number;
  to?: number;
  page?: number;
  limit?: number;
  /** true → demo-device records ONLY; false/undefined → real-device records only. */
}

export interface ListMeasuresOptions {
  organizationId: string;
  recordId: string;
  page?: number;
  limit?: number;
  /** Window bounds in epoch ms. Omitted means the whole day the record covers. */
  from?: number;
  to?: number;
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

/**
 * A malformed id is simply a record that does not exist. Left to reach
 * `new Types.ObjectId`, it threw and answered 500.
 */
function recordNotFound(): Error {
  // `statusCode` is what the exception filter reads. With `code` alone this
  // answered 500 for every missing record, not only malformed ids.
  return Object.assign(new Error('Record not found'), { statusCode: 404, code: 'NOT_FOUND' });
}

@Injectable()
export class RecordsService {
  async listRecords(opts: ListRecordsOptions): Promise<ListRecordsResult> {
    const { organizationId, deviceId, from, to } = opts;
    // A page below 1 became a negative skip, which Mongo refuses with an error
    // the caller saw as a 500; a NaN limit produced an empty page. Both are the
    // caller's mistake, so they are corrected to the nearest sensible value.
    const page = Number.isFinite(opts.page) ? Math.max(1, Math.floor(opts.page as number)) : 1;
    const limit = Number.isFinite(opts.limit) ? Math.min(100, Math.max(1, Math.floor(opts.limit as number))) : 20;
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

  async getRecord(organizationId: string, recordId: string) {
    if (!Types.ObjectId.isValid(recordId)) throw recordNotFound();
    const record = await MetRecord.findOne({ _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), deletedAt: null }).lean();
    if (!record) throw recordNotFound();
    return record;
  }

  async updateRecord(organizationId: string, recordId: string, body: { comment?: string }) {
    if (!Types.ObjectId.isValid(recordId)) throw recordNotFound();
    const record = await MetRecord.findOneAndUpdate(
      { _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), deletedAt: null },
      { $set: { comment: body.comment ?? '' } },
      { new: true },
    ).lean();
    if (!record) throw recordNotFound();
    return record;
  }

  async deleteRecord(organizationId: string, recordId: string, actor: { userId: string; email: string; ipAddress?: string | null }) {
    if (!Types.ObjectId.isValid(recordId)) throw recordNotFound();
    const record = await MetRecord.findOne({ _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), deletedAt: null }).lean();
    if (!record) throw recordNotFound();
    await MetMeasure.deleteMany({ recordId: new Types.ObjectId(recordId) });
    await MetRecord.updateOne({ _id: new Types.ObjectId(recordId) }, { $set: { deletedAt: new Date() } });
    AuditLog.create({
      organizationId: new Types.ObjectId(organizationId), userId: new Types.ObjectId(actor.userId), userEmail: actor.email, ipAddress: actor.ipAddress ?? null,
      action: 'delete', resourceType: 'record', resourceId: (record._id as unknown as string).toString(),
      resourceName: record.deviceName + ' — ' + record.dateStart, changes: null,
    }).catch(() => {});
  }

  async getMeasures(opts: ListMeasuresOptions) {
    const { organizationId, recordId, from, to } = opts;
    // As in listRecords: a page below 1 became a negative skip and a 500.
    const page = Number.isFinite(opts.page) ? Math.max(1, Math.floor(opts.page as number)) : 1;
    const limit = Number.isFinite(opts.limit) ? Math.min(5000, Math.max(1, Math.floor(opts.limit as number))) : 1000;
    await this.getRecord(organizationId, recordId);
    const skip = (page - 1) * limit;
    /**
     * The window matters more than it looks.
     *
     * A record is one DAY, and a day at 1 Hz held ~86,000 readings. Without a
     * window, page 1 was simply the first `limit` readings of that day — the
     * first half hour — no matter which range the scope bar had selected. The
     * chart above the table then plotted that half hour, so any channel the
     * station samples once a minute (temperature, pressure) contributed a
     * handful of points and looked like it had no data at all, and anything
     * written later in the day was invisible.
     *
     * Served by `recordId_1_timestampMs_1`, so narrowing also makes it cheaper.
     */
    const span: Record<string, number> = {};
    if (typeof from === 'number') span.$gte = from;
    if (typeof to === 'number') span.$lte = to;
    const query = {
      recordId: new Types.ObjectId(recordId),
      organizationId: new Types.ObjectId(organizationId),
      ...(Object.keys(span).length ? { timestampMs: span } : {}),
    };
    const [items, total] = await Promise.all([
      MetMeasure.find(query).sort({ timestampMs: 1 }).skip(skip).limit(limit).lean(),
      MetMeasure.countDocuments(query),
    ]);
    return { data: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /**
   * Fields the chart may plot. A WHITELIST, not a convenience.
   *
   * These names are interpolated into an aggregation (`$avg: '$<field>'`), so an
   * unchecked value from the query string would let a caller read any field on
   * the document — including ones no endpoint exposes. Everything outside this
   * list is ignored rather than rejected, so adding a channel to the UI before
   * the API knows about it degrades to a missing series instead of a 400.
   */
  private static readonly SERIES_FIELDS = new Set([
    'tempC', 'humidityPct', 'pressureHpa', 'dewPointC',
    'windSpeedMs', 'windGustMs', 'windSpeedMean2mMs', 'windSpeedMean10mMs',
    'windDirTrueDeg', 'windDirRelDeg', 'windSpeedKmh', 'windSpeedKnots',
    'precipMm', 'precipRateMmHr', 'solarWm2', 'qnhHpa', 'qfeHpa',
    'gpsAltM', 'voltageV', 'batteryVoltageV', 'currentA',
  ]);

  /**
   * A bucketed series for the record chart.
   *
   * WHY NOT JUST READ THE ROWS
   * The chart used to plot the first N measures of the record. A day at 1 Hz is
   * ~86,000 rows, so N=2,000 covered the first THIRTY-THREE MINUTES — and since
   * wind is logged every second while temperature, humidity and pressure arrive
   * once a minute, that slice held 1,967 wind readings against 33 of each
   * environmental channel. Those four charts drew a stub at the left edge and
   * read as "no data", while 1,109 temperature readings sat in the same record
   * unplotted. Measured on the live record, not inferred.
   *
   * Bucketing fixes it by construction: every point covers an equal slice of the
   * WINDOW, so a channel sampled once a minute is as well represented as one
   * sampled every second, whatever the span. `$avg` skips null and missing, so a
   * bucket with no reading for a field returns null for that field alone and the
   * others are unaffected.
   */
  async getSeries(opts: {
    organizationId: string;
    recordId: string;
    fields: string[];
    from?: number;
    to?: number;
    points?: number;
  }) {
    const record = await this.getRecord(opts.organizationId, opts.recordId);
    const fields = opts.fields.filter((f) => RecordsService.SERIES_FIELDS.has(f));
    if (fields.length === 0) return { data: [], intervalMs: 0, fields: [] };

    // Default to the record's own span so the chart is full without the caller
    // having to know the day's bounds.
    const fromMs = opts.from ?? (record.dateStartMs as number) ?? 0;
    const toMs = opts.to ?? (record.dateEndMs as number) ?? Date.now();
    const points = Math.min(Math.max(opts.points ?? 500, 10), 2000);
    // Never finer than a minute: that is the stored resolution, so smaller
    // buckets would only manufacture empty ones between real readings.
    const intervalMs = Math.max(60_000, Math.ceil(Math.max(toMs - fromMs, 1) / points));

    const group = {
      _id: { $multiply: [{ $floor: { $divide: ['$timestampMs', intervalMs] } }, intervalMs] },
      ...Object.fromEntries(fields.map((f) => [f, { $avg: `$${f}` }])),
    } as PipelineStage.Group['$group'];

    const rows = await MetMeasure.aggregate<Record<string, number | null> & { _id: number }>([
      {
        $match: {
          recordId: new Types.ObjectId(opts.recordId),
          organizationId: new Types.ObjectId(opts.organizationId),
          rowType: 'data',
          timestampMs: { $gte: fromMs, $lte: toMs },
        },
      },
      { $group: group },
      { $sort: { _id: 1 } },
    ]);

    const data = rows.map((r) => {
      const out: Record<string, number | null> = { ts: r._id };
      for (const f of fields) {
        const v = r[f];
        out[f] = v === null || v === undefined ? null : Math.round(v * 100) / 100;
      }
      return out;
    });

    return { data, intervalMs, fields };
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
