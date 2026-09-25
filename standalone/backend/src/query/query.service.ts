import { Injectable } from '@nestjs/common';
import { once } from 'events';
import type { Writable } from 'stream';
import { Types, type PipelineStage } from 'mongoose';

import { Device } from '../models/Device';
import { Organization } from '../models/Organization';
import { MetMeasure } from '../models/MetMeasure';
import { convertUnit } from '../analytics/analytics.util';
import { dayStartAt } from '../utils/tz.util';
import { COLUMN_BY_KEY, QUERY_COLUMNS, RESOLUTIONS, coverageLabel, type QueryColumn, type Resolution } from './columns';
import { rise, stationRecordIds, totalBefore } from './rain-totals';
import { roundBearing } from '../common/bearing';

/**
 * The query screen: chosen parameters, over a chosen range, as a table or a CSV.
 *
 * ONE MINUTE, ONE HOUR OR ONE DAY A ROW. Minutes are the stored records; hours
 * and days are built from them — means for levels, the wind as a vector mean
 * weighted by how many readings each minute held, the highest gust, and RAIN AS A
 * TOTAL, never a mean. A day begins at the station's rain-day hour (midnight, or
 * the Bureau's 9am), for every column, so a day's rain and its other figures
 * describe the same 24 hours.
 *
 * THE TABLE AND THE CSV ARE ONE CODE PATH, so they cannot disagree. Both come out
 * in the organisation's display units, with the unit in each column's name.
 *
 * THE CSV STREAMS. Data is kept forever — ten years of minutes is ~5 million rows —
 * so minute rows are written as the database cursor yields them, never gathered
 * first. Hours and days are aggregated in the database; ten years of hours is
 * ~88,000 rows.
 */

export interface QueryInput {
  organizationId: string;
  deviceId: string;
  from: number;
  to: number;
  fields: string[];
  resolution: Resolution;
  page?: number;
  limit?: number;
}

export interface OutColumn {
  key: string;
  label: string;
  unit: string;
}

export interface QueryRow {
  /** Start of the minute, hour or day, ms. */
  t: number;
  [key: string]: number | null;
}

export interface QueryResult {
  columns: OutColumn[];
  rows: QueryRow[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
  resolution: Resolution;
  timezone: string;
  rainDayStartHour: number;
}

interface Station {
  deviceId: Types.ObjectId;
  name: string;
  timezone: string;
  rainDayStartHour: number;
  availableSensors: string[];
  units: { windSpeed: string; temperature: string; pressure: string };
}

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

/** Stored field behind each minute column. `rain` and `coverage` are derived. */
const MINUTE_FIELD: Readonly<Record<string, string>> = {
  windSpeed: 'windSpeedMs',
  windDir: 'windDirTrueDeg',
  windGust: 'windGustMs',
  windSpeed2m: 'windSpeedMean2mMs',
  windDir2m: 'windDir2mDeg',
  windSpeed10m: 'windSpeedMean10mMs',
  windDir10m: 'windDir10mDeg',
  temperature: 'tempC',
  humidity: 'humidityPct',
  pressure: 'pressureHpa',
  dewPoint: 'dewPointC',
};

const bad = (message: string) => Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' });

@Injectable()
export class QueryService {
  /** The columns this station can offer, in the organisation's units. */
  async columnsFor(organizationId: string, deviceId: string) {
    const station = await this.station(organizationId, deviceId);
    return {
      columns: this.offered(station).map((c) => ({ ...this.describe(c, station, 'minute'), minuteOnly: c.minuteOnly === true })),
      timezone: station.timezone,
      rainDayStartHour: station.rainDayStartHour,
      resolutions: RESOLUTIONS,
    };
  }

  async rows(q: QueryInput): Promise<QueryResult> {
    const station = await this.station(q.organizationId, q.deviceId);
    const columns = this.select(q, station);
    // A page or size that is not a positive number is a mistake in the request,
    // not something to guess at: `Number('abc')` used to reach the database as NaN
    // and answer 200 with no rows while reporting a row count above zero.
    const limit = wholeNumber(q.limit, DEFAULT_LIMIT, MAX_LIMIT, 'limit');
    const page = wholeNumber(q.page, 1, Number.MAX_SAFE_INTEGER, 'page');

    let rows: QueryRow[];
    let total: number;
    if (q.resolution === 'minute') {
      ({ rows, total } = await this.minutePage(q, station, columns, page, limit));
    } else {
      const all = await this.buckets(q, station, columns);
      total = all.length;
      rows = all.slice((page - 1) * limit, page * limit);
    }
    return {
      columns: columns.map((c) => this.describe(c, station, q.resolution)),
      rows,
      total,
      page,
      limit,
      pageCount: Math.max(Math.ceil(total / limit), 1),
      resolution: q.resolution,
      timezone: station.timezone,
      rainDayStartHour: station.rainDayStartHour,
    };
  }

  /**
   * The same rows as a CSV, streamed to `out`. Returns the file name to offer.
   * Two time columns: the station's local time, and UTC.
   */
  async csv(q: QueryInput, out: Writable, setFilename: (name: string) => void): Promise<void> {
    const station = await this.station(q.organizationId, q.deviceId);
    const columns = this.select(q, station);
    const described = columns.map((c) => this.describe(c, station, q.resolution));
    // The station's days, like the rows inside the file — a file of Melbourne
    // readings was named with the UTC date, a day earlier than every row in it.
    const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: station.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const day = (ms: number) => dayFmt.format(new Date(ms));
    setFilename(`${safe(station.name)}-${q.resolution}-${day(q.from)}-to-${day(q.to - 1)}.csv`);

    const local = localFormatter(station.timezone);
    const write = async (line: string) => {
      if (!out.write(`${line}\r\n`)) await once(out, 'drain');
    };
    await write(
      [`Time (${station.timezone})`, 'Time (UTC)', ...described.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label))]
        .map(csvCell)
        .join(','),
    );
    const emit = (r: QueryRow) =>
      write([local(r.t), new Date(r.t).toISOString().slice(0, 16) + 'Z', ...columns.map((c) => cellValue(r[c.key]))].join(','));

    if (q.resolution === 'minute') {
      await this.eachMinute(q, station, columns, emit);
    } else {
      for (const r of await this.buckets(q, station, columns)) await emit(r);
    }
  }

  // ── Station, columns, units ───────────────────────────────────────────────

  private async station(organizationId: string, deviceId: string): Promise<Station> {
    if (!Types.ObjectId.isValid(deviceId)) {
      throw Object.assign(new Error('Station not found'), { statusCode: 404, code: 'NOT_FOUND' });
    }
    const [device, org] = await Promise.all([
      Device.findOne({ _id: new Types.ObjectId(deviceId), organizationId: new Types.ObjectId(organizationId), deletedAt: null })
        .select('name customName rainDayStartHour availableSensors')
        .lean(),
      Organization.findById(organizationId).select('timezone displayUnits').lean(),
    ]);
    if (!device) throw Object.assign(new Error('Station not found'), { statusCode: 404, code: 'NOT_FOUND' });
    const u = org?.displayUnits;
    return {
      deviceId: device._id as Types.ObjectId,
      name: device.customName || device.name,
      timezone: org?.timezone || 'UTC',
      rainDayStartHour: device.rainDayStartHour ?? 0,
      availableSensors: device.availableSensors ?? [],
      units: {
        // Beaufort is a display scale, not a measurement: a table of forces would
        // throw away the speed. Such an organisation gets m/s here.
        windSpeed: ['m/s', 'km/h', 'knots', 'mph'].includes(u?.windSpeed ?? '') ? u!.windSpeed : 'm/s',
        temperature: ['°C', '°F'].includes(u?.temperature ?? '') ? u!.temperature : '°C',
        pressure: ['hPa', 'mbar', 'inHg', 'mmHg'].includes(u?.pressure ?? '') ? u!.pressure : 'hPa',
      },
    };
  }

  /** Columns the station reports; a station that has not ingested yet is offered everything. */
  private offered(station: Station): readonly QueryColumn[] {
    if (station.availableSensors.length === 0) return QUERY_COLUMNS;
    return QUERY_COLUMNS.filter((c) => c.sensor === null || station.availableSensors.includes(c.sensor));
  }

  private select(q: QueryInput, station: Station): QueryColumn[] {
    if (!RESOLUTIONS.includes(q.resolution)) throw bad(`resolution must be one of ${RESOLUTIONS.join(', ')}`);
    if (!Number.isFinite(q.from) || !Number.isFinite(q.to) || q.to <= q.from) throw bad('from and to must be times (Unix ms), with from before to');
    const unknown = q.fields.filter((f) => !COLUMN_BY_KEY.has(f));
    if (unknown.length) throw bad(`Unknown column: ${unknown.join(', ')}`);
    if (q.fields.length === 0) throw bad('Choose at least one column');
    const offered = new Set(this.offered(station).map((c) => c.key));
    // Kept in the catalogue's order, not the order ticked: a table whose columns
    // shuffle with the clicking is harder to read than one that never moves.
    return QUERY_COLUMNS.filter(
      (c) => q.fields.includes(c.key) && offered.has(c.key) && !(c.minuteOnly && q.resolution !== 'minute'),
    );
  }

  private describe(c: QueryColumn, station: Station, resolution: Resolution): OutColumn {
    const unit = c.kind === 'fixed' ? c.unit ?? '' : station.units[c.kind];
    return { key: c.key, label: c.key === 'coverage' ? coverageLabel(resolution) : c.label, unit };
  }

  /** A stored value (m/s, °C, hPa) in the organisation's unit, rounded for reading. */
  private convert(c: QueryColumn, station: Station, v: number | null | undefined): number | null {
    if (v === null || v === undefined || !Number.isFinite(v)) return null;
    let out = v;
    if (c.kind === 'windSpeed' && station.units.windSpeed !== 'm/s') out = convertUnit(v, 'm/s', station.units.windSpeed).result;
    else if (c.kind === 'temperature' && station.units.temperature !== '°C') out = convertUnit(v, '°C', station.units.temperature).result;
    else if (c.kind === 'pressure' && station.units.pressure !== 'hPa') out = convertUnit(v, 'hPa', station.units.pressure).result;
    if (c.unit === '°') return roundBearing(out, 0);
    const dp = c.key === 'coverage' ? 0 : c.unit === '%' ? 1 : 2;
    return Math.round(out * 10 ** dp) / 10 ** dp;
  }

  // ── Minute rows ───────────────────────────────────────────────────────────

  private async minuteMatch(q: QueryInput, station: Station) {
    const recordIds = await stationRecordIds(station.deviceId);
    return { recordIds, match: { recordId: { $in: recordIds }, res: '1m', timestampMs: { $gte: q.from, $lt: q.to } } };
  }

  private minuteRow(doc: Record<string, unknown>, columns: QueryColumn[], station: Station, prevTotal: number | null): QueryRow {
    const row: QueryRow = { t: doc.timestampMs as number };
    for (const c of columns) {
      if (c.key === 'rain') row.rain = this.convert(c, station, rise(prevTotal, (doc.precipMm as number | null) ?? null));
      else if (c.key === 'coverage') row.coverage = (doc.windSampleCount as number | undefined) ?? null;
      else row[c.key] = this.convert(c, station, doc[MINUTE_FIELD[c.key]] as number | null);
    }
    return row;
  }

  private projection(columns: QueryColumn[]): string {
    const fields = new Set(['timestampMs', 'precipMm']);
    for (const c of columns) {
      if (MINUTE_FIELD[c.key]) fields.add(MINUTE_FIELD[c.key]);
      if (c.key === 'coverage') fields.add('windSampleCount');
    }
    return [...fields].join(' ');
  }

  private async minutePage(q: QueryInput, station: Station, columns: QueryColumn[], page: number, limit: number) {
    const { recordIds, match } = await this.minuteMatch(q, station);
    const [total, docs] = await Promise.all([
      MetMeasure.countDocuments(match),
      MetMeasure.find(match)
        .sort({ timestampMs: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(this.projection(columns))
        .lean(),
    ]);
    // The page's first minute measures its rain from the last total stored before
    // it — wherever that is, and whatever page this is.
    let prev = docs.length ? await totalBefore(recordIds, docs[0].timestampMs) : null;
    const rows: QueryRow[] = [];
    for (const d of docs) {
      rows.push(this.minuteRow(d as unknown as Record<string, unknown>, columns, station, prev));
      if (d.precipMm !== null && d.precipMm !== undefined) prev = d.precipMm;
    }
    return { rows, total };
  }

  private async eachMinute(q: QueryInput, station: Station, columns: QueryColumn[], emit: (r: QueryRow) => Promise<void>) {
    const { recordIds, match } = await this.minuteMatch(q, station);
    let prev = await totalBefore(recordIds, q.from);
    const cursor = MetMeasure.find(match).sort({ timestampMs: 1 }).select(this.projection(columns)).lean().cursor({ batchSize: 2000 });
    for await (const d of cursor) {
      const doc = d as unknown as Record<string, unknown>;
      await emit(this.minuteRow(doc, columns, station, prev));
      if (doc.precipMm !== null && doc.precipMm !== undefined) prev = doc.precipMm as number;
    }
  }

  // ── Hour and day rows ─────────────────────────────────────────────────────

  /**
   * Minutes grouped by local hour in the database, then — for days — hours folded
   * into days in code, because a day may start at 9am and a database date
   * truncation only knows midnight. Sums and counts travel, not means, so folding
   * hours into days is exact.
   */
  private async buckets(q: QueryInput, station: Station, columns: QueryColumn[]): Promise<QueryRow[]> {
    const recordIds = await stationRecordIds(station.deviceId);
    const present = (f: string) => ({ $cond: [{ $ne: [{ $ifNull: [`$${f}`, null] }, null] }, 1, 0] });
    const weight = { $ifNull: ['$windSampleCount', 1] };
    const levels = ['tempC', 'humidityPct', 'pressureHpa', 'dewPointC'];
    const group: Record<string, unknown> = {
      _id: { $dateTrunc: { date: { $toDate: '$timestampMs' }, unit: 'hour', timezone: station.timezone } },
      minutes: { $sum: 1 },
      windW: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$windSpeedMs', null] }, null] }, weight, 0] } },
      windSum: { $sum: { $multiply: [{ $ifNull: ['$windSpeedMs', 0] }, weight] } },
      dirW: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$windDirSin', null] }, null] }, weight, 0] } },
      sinSum: { $sum: { $multiply: [{ $ifNull: ['$windDirSin', 0] }, weight] } },
      cosSum: { $sum: { $multiply: [{ $ifNull: ['$windDirCos', 0] }, weight] } },
      gust: { $max: '$windGustMs' },
      rainTotal: { $max: '$precipMm' },
    };
    for (const f of levels) {
      group[`${f}Sum`] = { $sum: { $ifNull: [`$${f}`, 0] } };
      group[`${f}N`] = { $sum: present(f) };
    }
    const pipeline: PipelineStage[] = [
      { $match: { recordId: { $in: recordIds }, res: '1m', timestampMs: { $gte: q.from, $lt: q.to } } },
      { $group: group as PipelineStage.Group['$group'] },
      { $sort: { _id: 1 } },
    ];
    const hours = await MetMeasure.aggregate<Record<string, number | Date | null>>(pipeline);

    // Fold into buckets: each hour on its own, or every hour of one rain day.
    type Acc = Record<string, number | null> & { t: number };
    const out: Acc[] = [];
    let cur: Acc | null = null;
    const sumKeys = ['minutes', 'windW', 'windSum', 'dirW', 'sinSum', 'cosSum', ...levels.flatMap((f) => [`${f}Sum`, `${f}N`])];
    for (const h of hours) {
      const hourStart = (h._id as Date).getTime();
      const t = q.resolution === 'hour' ? hourStart : dayStartAt(hourStart, station.rainDayStartHour, station.timezone).startMs;
      if (!cur || cur.t !== t) {
        cur = { t, gust: null, rainTotal: null } as Acc;
        for (const k of sumKeys) cur[k] = 0;
        out.push(cur);
      }
      for (const k of sumKeys) cur[k] = (cur[k] as number) + ((h[k] as number) ?? 0);
      if (h.gust !== null && (cur.gust === null || (h.gust as number) > cur.gust)) cur.gust = h.gust as number;
      if (h.rainTotal !== null && (cur.rainTotal === null || (h.rainTotal as number) > cur.rainTotal)) cur.rainTotal = h.rainTotal as number;
    }

    const wantsRain = columns.some((c) => c.key === 'rain');
    let prevTotal = wantsRain ? await totalBefore(recordIds, q.from) : null;
    const mean = (b: Acc, f: string) => ((b[`${f}N`] as number) > 0 ? (b[`${f}Sum`] as number) / (b[`${f}N`] as number) : null);

    return out.map((b) => {
      const row: QueryRow = { t: b.t };
      // A bearing only when the vectors actually point somewhere: an hour whose
      // minutes cancel (a sea breeze reversing, say) would otherwise report a
      // confident direction built from floating-point residue. Same rule as the
      // stored minutes (minute-aggregate's dirFromComponents).
      const dirW = b.dirW as number;
      const sinMean = dirW > 0 ? (b.sinSum as number) / dirW : 0;
      const cosMean = dirW > 0 ? (b.cosSum as number) / dirW : 0;
      const dir =
        dirW > 0 && Math.hypot(sinMean, cosMean) >= 1e-9
          ? roundBearing((Math.atan2(sinMean, cosMean) * 180) / Math.PI, 0)
          : null;
      const rain = b.rainTotal === null ? null : rise(prevTotal, b.rainTotal);
      if (b.rainTotal !== null) prevTotal = b.rainTotal;
      const raw: Record<string, number | null> = {
        windSpeed: (b.windW as number) > 0 ? (b.windSum as number) / (b.windW as number) : null,
        windDir: dir,
        windGust: b.gust,
        temperature: mean(b, 'tempC'),
        humidity: mean(b, 'humidityPct'),
        pressure: mean(b, 'pressureHpa'),
        dewPoint: mean(b, 'dewPointC'),
        rain,
      };
      for (const c of columns) row[c.key] = c.key === 'coverage' ? (b.minutes as number) : this.convert(c, station, raw[c.key]);
      return row;
    });
  }
}

/** `YYYY-MM-DD HH:mm` in the station's timezone. */
/**
 * A whole number the caller asked for, or a 400. Anything else — "abc", 0, -3,
 * 1.5 — is a mistake in the request and is told so, rather than being quietly
 * turned into something else (or into NaN, which read as "no rows" while the
 * count said otherwise).
 */
function wholeNumber(value: number | undefined, fallback: number, max: number, field: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw Object.assign(new Error(`${field} must be a whole number of at least 1`), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  return Math.min(value, max);
}

function localFormatter(timeZone: string): (ms: number) => string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return (ms) => {
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  };
}

function cellValue(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

/** A header cell, quoted only if it needs to be. */
function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A station name fit for a file name. */
function safe(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'station';
}
