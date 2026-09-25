import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';

import { Device } from '../models/Device';
import { Organization } from '../models/Organization';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { applyQc, type QcState } from './qc';
import {
  aggregateToMinutes,
  combineMinutes,
  MINUTE_MS,
  type MinuteAggregate,
  type MinuteWindowInput,
} from './minute-aggregate';
import { MetRawSample } from '../models/MetRawSample';
import { ParsedMetRow } from './met-row';
import { localDayKey } from '../utils/tz.util';
import { DomainEvent } from '../realtime/realtime.events';
import { roundBearing } from '../common/bearing';

/**
 * Parsed readings → minute records.
 *
 * The sensor stream (src/stream) frames, checks and parses the GMX551's
 * readings; this does the rest, exactly as the cloud did for SFTP files: QC,
 * one record per minute, one day record per local day, then one MET_MEASURES
 * for the daily rollup, the live display and the alert rules.
 *
 * The cloud's SFTP half — file idempotency, station accounts, stream routing,
 * the CSV parsers — was removed in Phase 2; the stream replaced it.
 */

type LatestRow = Record<string, unknown> & { measuredAtMs: number; recordId: string };
type Extremes = Record<string, { min: number; max: number }>;
/** Where a batch of readings came from — stored on every row and day record. */
type IngestSource = 'stream';

/** What writing one batch of parsed readings produced. */
export interface WriteOutcome {
  inserted: number;
  lastRecordId: Types.ObjectId | null;
  dayKeys: string[];
  qcFlagged: number;
}

/** Fields an alert rule can be built on — see alert-rules/evaluate.ts MET_SENSOR_MAP. */
const ALERTABLE_FIELDS = ['windSpeedMs', 'windDirTrueDeg', 'tempC', 'humidityPct', 'pressureHpa', 'dewPointC'] as const;

interface ResolvedStation {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  timezone: string;
  headingOffsetDeg: number;
  /** Keep the raw per-second samples as well as the minute record. Off by default. */
  storeRawSamples: boolean;
}

/** How long a station's QC tail stays useful, and how many stations to hold. */
const QC_STATE_TTL_MS = 6 * 60 * 60_000;
const QC_STATE_MAX_ENTRIES = 500;

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Newest row of a batch, in the exact shape the alert sensor map and the
   * realtime gateway expect.
   *
   * Returned rather than stored on the instance: Nest providers are singletons,
   * so instance state here would be shared between concurrent requests and two
   * overlapping batches would publish each other's "latest" reading.
   *
   * Picked by reduce, never `Math.max(...)` — a day at 1 Hz is 86,400 values and
   * the spread form throws RangeError past roughly 100k arguments.
   */
  /**
   * Min/max per alertable field across a batch.
   *
   * Accumulated into `into` so a multi-file request produces one set of extremes
   * spanning everything it carried.
   */
  private accumulateExtremes(rows: ParsedMetRow[], offsetDeg: number, into: Extremes): void {
    for (const r of rows) {
      const values: Record<string, number | null> = {
        windSpeedMs: r.windSpeedMs,
        windDirTrueDeg: this.trueBearing(r.windDirRelDeg, offsetDeg),
        tempC: r.tempC,
        humidityPct: r.humidityPct,
        pressureHpa: r.pressureHpa,
        dewPointC: r.dewPointC,
      };
      for (const field of ALERTABLE_FIELDS) {
        const v = values[field];
        if (v === null || v === undefined || Number.isNaN(v)) continue;
        const cur = into[field];
        if (!cur) into[field] = { min: v, max: v };
        else {
          if (v < cur.min) cur.min = v;
          if (v > cur.max) cur.max = v;
        }
      }
    }
  }

  private pickLatest(rows: ParsedMetRow[], recordId: Types.ObjectId, offsetDeg: number): LatestRow {
    let newest = rows[0];
    for (const r of rows) if (r.timestampMs > newest.timestampMs) newest = r;
    return {
      measuredAtMs: newest.timestampMs,
      recordId: String(recordId),
      windSpeedMs: newest.windSpeedMs,
      windSpeedKmh: newest.windSpeedKmh,
      windDirTrueDeg: this.trueBearing(newest.windDirRelDeg, offsetDeg),
      windDirRelDeg: newest.windDirRelDeg,
      tempC: newest.tempC,
      humidityPct: newest.humidityPct,
      pressureHpa: newest.pressureHpa,
      dewPointC: newest.dewPointC,
    };
  }

  /**
   * One MetRecord per station per LOCAL day, created on demand.
   *
   * `dateEndMs` is left null while the day is open: daily-summary.service matches
   * `dateEndMs == null OR >= dayStart`, so a null end keeps the in-progress day
   * visible to the rollup. A too-narrow end would silently produce no summary.
   */
  private async upsertDayRecord(
    station: ResolvedStation,
    dayKey: string,
    firstTsMs: number,
    source: IngestSource,
  ): Promise<Types.ObjectId> {
    const deviceId = new Types.ObjectId(station.deviceId);
    const organizationId = new Types.ObjectId(station.organizationId);

    const existing = await MetRecord.findOne({ deviceId, dayKey }).select('_id').lean();
    if (existing) return existing._id as Types.ObjectId;

    try {
      const created = await MetRecord.create({
        organizationId,
        deviceId,
        deviceName: station.deviceName,
        dayKey,
        source,
        dateStart: new Date(firstTsMs).toISOString(),
        dateStartMs: firstTsMs,
        dateEnd: null,
        dateEndMs: null,
        comment: `Sensor stream — ${dayKey}`,
        measureCount: 0,
        hasHeaderRow: true,
        syncedAt: new Date(),
      });
      return created._id as Types.ObjectId;
    } catch (err) {
      // Two concurrent batches for a new day race here. The partial unique index
      // on { deviceId, dayKey } makes one lose with E11000; it simply reads the
      // winner's row.
      const raced = await MetRecord.findOne({ deviceId, dayKey }).select('_id').lean();
      if (raced) return raced._id as Types.ObjectId;
      throw err;
    }
  }

  /**
   * Relative bearing → true bearing, via the device's surveyed mast offset.
   * Null stays null: a calm reading has no bearing, and rotating `null` into 0
   * would put a large false spike on due north.
   */
  private trueBearing(relDeg: number | null, offsetDeg: number): number | null {
    if (relDeg === null) return null;
    // Rounded like every other stored bearing (minute-aggregate rounds to 2 dp):
    // the raw sum wrote 0.22000000000002728 to disk, for ever.
    return roundBearing(relDeg + offsetDeg);
  }

  /**
   * The QC tail per station+stream, so the continuity checks survive a file
   * boundary.
   *
   * In memory, and deliberately not in the database: it is a cache, not a
   * record. Losing it on a restart costs one missed step comparison on the next
   * file and nothing else, which is not worth a write on the ingest hot path —
   * the alternative is an extra indexed read per file, every minute, per station.
   *
   * The TTL bounds the map in a long-lived process and drops stations that have
   * gone quiet. An entry older than the gap the checks tolerate is worthless
   * anyway, because `applyQc` refuses to compare across a gap that wide.
   */
  private readonly qcStates = new Map<string, { state: QcState; expiresAt: number }>();

  private qcStateFor(key: string): QcState {
    const hit = this.qcStates.get(key);
    return hit && hit.expiresAt > Date.now() ? hit.state : {};
  }

  private rememberQcState(key: string, state: QcState): void {
    const now = Date.now();
    this.qcStates.set(key, { state, expiresAt: now + QC_STATE_TTL_MS });
    // Evict lazily on write; a sweep timer would be a second thing to shut down
    // cleanly in tests for no benefit at this size.
    if (this.qcStates.size > QC_STATE_MAX_ENTRIES) {
      for (const [k, v] of this.qcStates) if (v.expiresAt <= now) this.qcStates.delete(k);
    }
  }

  /**
   * Minute records already written that a rolling window needs.
   *
   * Scoped through the day records rather than by device id, because
   * `MetMeasure` carries `recordId` and not `deviceId`. A 10-minute window can
   * reach across local midnight, so both days are resolved — otherwise the first
   * ten minutes of every day would silently compute their means from nothing.
   */
  private async loadRecentMinutes(
    station: ResolvedStation,
    fromMs: number,
    toMs: number,
  ): Promise<MinuteWindowInput[]> {
    const dayKeys = [...new Set([localDayKey(fromMs, station.timezone), localDayKey(toMs, station.timezone)])];
    const records = await MetRecord.find({
      deviceId: new Types.ObjectId(station.deviceId),
      dayKey: { $in: dayKeys },
    })
      .select('_id')
      .lean();
    if (records.length === 0) return [];

    const rows = await MetMeasure.find({
      recordId: { $in: records.map((r) => r._id as Types.ObjectId) },
      res: '1m',
      timestampMs: { $gte: fromMs, $lte: toMs },
    })
      .select('timestampMs windSpeedMs windSampleCount windDirSin windDirCos')
      .lean();

    return rows.map((r) => ({
      minuteMs: r.timestampMs,
      windSpeedMs: r.windSpeedMs ?? null,
      windSampleCount: r.windSampleCount ?? 0,
      windDirSin: r.windDirSin ?? null,
      windDirCos: r.windDirCos ?? null,
    }));
  }

  /**
   * Write one record per minute, merging rather than replacing.
   *
   * `$set` of only the keys this stream actually produced is the important part:
   * the wind file and the environmental file describe the SAME minute and arrive
   * separately, so a wholesale replace would have each erase the other's
   * columns, and the row would flip between half-empty shapes depending on which
   * file landed last.
   */
  private async upsertMinuteRecords(
    minutes: MinuteAggregate[],
    windowPool: MinuteWindowInput[],
    recordId: Types.ObjectId,
    organizationId: Types.ObjectId,
    headingOffsetDeg: number,
    source: IngestSource,
  ): Promise<number> {
    if (minutes.length === 0) return 0;

    const ops = minutes.map((m) => {
      const hasWind = m.windSampleCount > 0;
      const mean2 = hasWind ? combineMinutes(windowPool, m.minuteMs, 2 * MINUTE_MS) : null;
      const mean10 = hasWind ? combineMinutes(windowPool, m.minuteMs, 10 * MINUTE_MS) : null;

      const set: Record<string, unknown> = {
        organizationId,
        rowType: 'data',
        res: '1m',
        source,
        dataSentence: m.raw,
        timeStamp: new Date(m.minuteMs).toISOString(),
      };
      const assign = (k: string, v: unknown) => {
        // Absent, not null: a wind-only station would otherwise store an explicit
        // null for every environmental column on all 1,440 records a day.
        if (v !== null && v !== undefined) set[k] = v;
      };

      if (hasWind) {
        assign('windSpeedMs', m.windSpeedMs);
        assign('windSpeedKmh', m.windSpeedMs === null ? null : Math.round(m.windSpeedMs * 3.6 * 100) / 100);
        assign('windDirRelDeg', m.windDirRelDeg);
        assign('windDirTrueDeg', this.trueBearing(m.windDirRelDeg, headingOffsetDeg));
        assign('windSampleCount', m.windSampleCount);
        assign('windDirSin', m.windDirSin);
        assign('windDirCos', m.windDirCos);
        assign('windGustMs', m.windGustMs);
        assign('windGustDirDeg', this.trueBearing(m.windGustDirDeg, headingOffsetDeg));
        assign('windSpeedMean2mMs', mean2?.speedMs ?? null);
        assign('windDir2mDeg', this.trueBearing(mean2?.dirDeg ?? null, headingOffsetDeg));
        assign('windSpeedMean10mMs', mean10?.speedMs ?? null);
        assign('windDir10mDeg', this.trueBearing(mean10?.dirDeg ?? null, headingOffsetDeg));
        assign('windMean10mMinutes', mean10?.minutes);
      }
      assign('tempC', m.tempC);
      assign('humidityPct', m.humidityPct);
      assign('pressureHpa', m.pressureHpa);
      assign('dewPointC', m.dewPointC);
      assign('solarWm2', m.solarWm2);
      assign('precipMm', m.precipMm);
      assign('voltageV', m.voltageV);
      assign('gpsLat', m.gpsLat);
      assign('gpsLng', m.gpsLng);
      if (m.qc?.length) set.qc = m.qc;

      return {
        updateOne: {
          filter: { recordId, timestampMs: m.minuteMs, res: '1m' },
          update: { $set: set, $setOnInsert: { recordId, timestampMs: m.minuteMs } },
          upsert: true,
        },
      };
    });

    const res = await MetMeasure.bulkWrite(ops, { ordered: false });
    // Only new minutes count toward the day's measure total; a second file
    // merging into a minute that already exists must not inflate it.
    return res.upsertedCount ?? 0;
  }

  /**
   * Keep the per-second samples too, for a station that asked for them.
   *
   * Deliberately a separate collection: `metmeasures` is one record per minute
   * now, and putting 1 Hz rows back into it would put two resolutions behind one
   * query. See `Device.storeRawSamples`.
   */
  private async storeRawSamples(
    station: ResolvedStation,
    organizationId: Types.ObjectId,
    rows: ParsedMetRow[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const deviceId = new Types.ObjectId(station.deviceId);
    const docs = rows.map((r) => ({
      deviceId,
      organizationId,
      minuteMs: Math.floor(r.timestampMs / MINUTE_MS) * MINUTE_MS,
      timestampMs: r.timestampMs,
      ...(r.windSpeedMs === null ? {} : { windSpeedMs: r.windSpeedMs }),
      ...(r.windDirRelDeg === null ? {} : { windDirRelDeg: r.windDirRelDeg }),
      ...(r.qc?.length ? { qc: r.qc } : {}),
    }));
    // Never fatal: raw retention is a debugging convenience, and losing it must
    // not fail an ingest whose minute records were written correctly.
    await MetRawSample.insertMany(docs, { ordered: false }).catch((err: unknown) =>
      this.logger.warn(`raw sample store failed for ${station.deviceName}: ${String(err)}`),
    );
  }

  /** Minute aggregates in the per-reading shape `pickLatest`/`accumulateExtremes` read. */
  private minutesAsRows(minutes: MinuteAggregate[]): ParsedMetRow[] {
    const rows: ParsedMetRow[] = [];
    for (const m of minutes) {
      const base = {
        raw: m.raw,
        windSpeedKmh: m.windSpeedMs === null ? null : Math.round(m.windSpeedMs * 3.6 * 100) / 100,
        windSpeedKnots: null,
        windDirRelDeg: m.windDirRelDeg,
        tempC: m.tempC,
        humidityPct: m.humidityPct,
        pressureHpa: m.pressureHpa,
        dewPointC: m.dewPointC,
        solarWm2: m.solarWm2,
        precipMm: m.precipMm,
        voltageV: m.voltageV,
        gpsLat: m.gpsLat,
        gpsLng: m.gpsLng,
        status: null,
      };
      rows.push({ ...base, timestampMs: m.minuteMs, windSpeedMs: m.windSpeedMs });
      // The GUST is offered to the extremes alongside the mean. Without it an
      // alert on "wind above X" would stop firing the moment we started storing
      // minutes, because a mean hides the peak that the threshold is about.
      if (m.windGustMs !== null) {
        rows.push({ ...base, timestampMs: m.minuteMs, windSpeedMs: m.windGustMs });
      }
    }
    return rows;
  }

  /**
   * Everything that must happen ONCE per batch, not once per minute.
   *
   * Emitting per minute of a catch-up would be actively harmful: the rollup
   * listener re-reads the whole day on every event, a catch-up would fire
   * hundreds of socket broadcasts, and alert rules would be evaluated hundreds of
   * times for the same reading.
   */
  private async afterBatch(
    station: ResolvedStation,
    batch: { sensorsSeen: string[]; dayKeys: string[] },
    latest: LatestRow | null,
    extremes: Extremes,
    source: IngestSource,
  ): Promise<void> {

    const deviceId = new Types.ObjectId(station.deviceId);

    // ── Device liveness ──────────────────────────────────────────────────
    // Online status is `lastSeenAt` within 5 minutes (devices.service.ts), and
    // nothing else writes it.
    const now = new Date();
    const before = await Device.findOne({ _id: deviceId }).select('lastSeenAt availableSensors').lean();
    const wasOffline = !(before?.lastSeenAt && now.getTime() - new Date(before.lastSeenAt).getTime() < 5 * 60 * 1000);

    // ── availableSensors ─────────────────────────────────────────────────
    // Union of what this batch actually carried, merged with what we knew.
    // Written only when it changes: an unconditional update would be 1,440
    // pointless writes per station per day.
    const seen = new Set<string>(before?.availableSensors ?? []);
    let grew = false;
    for (const k of batch.sensorsSeen) if (!seen.has(k)) { seen.add(k); grew = true; }

    const update: Record<string, unknown> = { lastSeenAt: now, isOnline: true };
    if (grew) {
      update.availableSensors = [...seen].sort();
      update.sensorsUpdatedAt = now;
    }
    await Device.updateOne({ _id: deviceId }, { $set: update }).catch(() => void 0);

    this.eventEmitter.emit(DomainEvent.DEVICE_STATUS, {
      organizationId: station.organizationId,
      deviceId: station.deviceId,
      deviceName: station.deviceName,
      isOnline: true,
      lastSeenAt: now,
      justConnected: wasOffline,
    });

    // ── One MET_MEASURES for the whole request ───────────────────────────
    if (!latest) return;

    const dayKeys = [...new Set(batch.dayKeys)].sort();
    // Older than ten minutes means this is history, not a live reading. The
    // gateway suppresses the live broadcast so the dashboard gauge does not jump
    // backwards in time.
    const isBackfill = Date.now() - latest.measuredAtMs > 10 * 60 * 1000;

    this.eventEmitter.emit(DomainEvent.MET_MEASURES, {
      organizationId: station.organizationId,
      deviceId: station.deviceId,
      recordId: latest.recordId,
      latest,
      dayKeys,
      isBackfill,
      source,
      timezone: station.timezone,
      // Alert rules evaluate against these, not `latest` — see realtime.events.ts.
      extremes,
    });
  }

  /**
   * One completed minute (or several) from the sensor stream.
   *
   * The stream reader has already framed, checked and parsed the readings and
   * timestamped them on receipt; from here they take the path the cloud's SFTP
   * files took — QC, minute record, day record, then one MET_MEASURES for the
   * daily rollup, the live display and the alert rules.
   *
   * Returns null when the station no longer exists (deleted while streaming).
   */
  async ingestStreamRows(
    organizationId: string,
    deviceId: string,
    rows: ParsedMetRow[],
    sensorsSeen: string[],
  ): Promise<WriteOutcome | null> {
    if (rows.length === 0) return { inserted: 0, lastRecordId: null, dayKeys: [], qcFlagged: 0 };
    const station = await this.resolveDevice(organizationId, deviceId);
    if (!station) return null;

    const latestRef: { value: LatestRow | null } = { value: null };
    const extremes: Extremes = {};
    const out = await this.writeParsedRows(
      station,
      rows,
      { qcKey: `${deviceId}:stream`, source: 'stream', label: 'sensor stream' },
      latestRef,
      extremes,
    );
    if (out.inserted > 0 || out.dayKeys.length > 0) {
      await this.afterBatch(station, { sensorsSeen, dayKeys: out.dayKeys }, latestRef.value, extremes, 'stream');
    }
    return out;
  }

  /** The station a stream batch belongs to — scoped to its organisation. */
  private async resolveDevice(organizationId: string, deviceId: string): Promise<ResolvedStation | null> {
    if (!Types.ObjectId.isValid(deviceId)) return null;
    const [device, org] = await Promise.all([
      Device.findOne({ _id: new Types.ObjectId(deviceId), organizationId: new Types.ObjectId(organizationId), deletedAt: null })
        .select('name headingOffsetDeg availableSensors storeRawSamples')
        .lean(),
      Organization.findById(organizationId).select('timezone').lean(),
    ]);
    if (!device) return null;
    return {
      organizationId,
      deviceId,
      deviceName: device.name,
      storeRawSamples: device.storeRawSamples === true,
      timezone: org?.timezone || 'UTC',
      headingOffsetDeg: device.headingOffsetDeg ?? 0,
    };
  }

  /**
   * Parsed readings → minute records: QC, one record per minute, one day record
   * per local day.
   */
  private async writeParsedRows(
    station: ResolvedStation,
    rows: ParsedMetRow[],
    opts: { qcKey: string; source: IngestSource; unitCode?: string | null; label: string },
    latestRef: { value: LatestRow | null },
    extremes: Extremes,
  ): Promise<WriteOutcome> {
    const organizationId = new Types.ObjectId(station.organizationId);

    // ── Quality control (WMO-No. 8 Part IV) ────────────────────────────────
    // Applied here rather than inside a parser so that EVERY stream type gets
    // the same checks — including ones added to the registry later, which would
    // otherwise each have to remember to run them.
    //
    // The state carries the tail of the previous file for this station and
    // stream, which is what lets the step and persistence checks see across a
    // file boundary. The environmental stream writes ONE row per file, so
    // without it neither check could ever fire on temperature, humidity or
    // pressure.
    const qc = applyQc(rows, this.qcStateFor(opts.qcKey));
    this.rememberQcState(opts.qcKey, qc.state);
    if (qc.flaggedRows > 0) {
      this.logger.warn(
        `QC flagged ${qc.flaggedRows}/${rows.length} rows in ${opts.label}: ${JSON.stringify(qc.counts)}`,
      );
    }

    // ── Per-second readings → one record per minute ────────────────────────
    // The stored record is the MINUTE, not the reading. See minute-aggregate.ts
    // for why the gust has to be computed here rather than derived later.
    const minutes = aggregateToMinutes(qc.rows);
    if (minutes.length === 0) return { inserted: 0, lastRecordId: null, dayKeys: [], qcFlagged: qc.flaggedRows };

    // The 2- and 10-minute means reach back beyond this file, so the minutes
    // already written are loaded once for the whole batch. Read from the
    // database rather than an in-process buffer because the API is serverless:
    // consecutive files for one station may be handled by different instances.
    const priorMinutes = await this.loadRecentMinutes(
      station,
      minutes[0].minuteMs - 10 * MINUTE_MS,
      minutes[0].minuteMs - MINUTE_MS,
    );

    // ── Group by LOCAL day ─────────────────────────────────────────────────
    // A file normally covers one minute, but a catch-up batch or a file spanning
    // local midnight can touch two days. Grouping here keeps one record per day.
    const byDay = new Map<string, MinuteAggregate[]>();
    for (const m of minutes) {
      const key = localDayKey(m.minuteMs, station.timezone);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(m);
      else byDay.set(key, [m]);
    }

    let inserted = 0;
    let lastRecordId: Types.ObjectId | null = null;

    for (const [dayKey, rows] of byDay) {
      let first = rows[0].minuteMs;
      for (const r of rows) if (r.minuteMs < first) first = r.minuteMs;

      const recordId = await this.upsertDayRecord(station, dayKey, first, opts.source);
      lastRecordId = recordId;

      // UPSERT, never insert: wind and environmental arrive as separate files
      // for the same minute, so whichever lands first creates the record and the
      // other merges into it. That is also what finally puts a minute's wind and
      // its temperature on ONE row instead of two half-empty ones.
      const written = await this.upsertMinuteRecords(
        rows,
        [...priorMinutes, ...minutes],
        recordId,
        organizationId,
        station.headingOffsetDeg,
        opts.source,
      );
      inserted += written;

      // `pickLatest` and `accumulateExtremes` read a per-reading shape; the
      // minute carries the same quantities under a different name for time.
      const asRows = this.minutesAsRows(rows);
      const candidate = this.pickLatest(asRows, recordId, station.headingOffsetDeg);
      if (!latestRef.value || candidate.measuredAtMs > latestRef.value.measuredAtMs) latestRef.value = candidate;
      this.accumulateExtremes(asRows, station.headingOffsetDeg, extremes);

      // $max / $min widen the day's span commutatively, so out-of-order arrival
      // during a catch-up cannot narrow it.
      let lo = rows[0].minuteMs;
      let hi = rows[0].minuteMs;
      for (const r of rows) {
        if (r.minuteMs < lo) lo = r.minuteMs;
        if (r.minuteMs > hi) hi = r.minuteMs;
      }
      await MetRecord.updateOne(
        { _id: recordId },
        {
          $inc: { measureCount: written },
          $min: { dateStartMs: lo },
          $max: { dateEndMs: hi },
          // Last writer wins. A station that genuinely switches unit mid-day ends
          // the day reporting its current one, which is what the display wants.
          ...(opts.unitCode ? { $set: { speedUnitCode: opts.unitCode } } : {}),
        },
      );
    }

    // Once per batch, not once per day: a batch spanning local midnight would
    // otherwise store every raw sample twice.
    if (station.storeRawSamples) await this.storeRawSamples(station, organizationId, qc.rows);

    return { inserted, lastRecordId, dayKeys: [...byDay.keys()], qcFlagged: qc.flaggedRows };
  }
}
