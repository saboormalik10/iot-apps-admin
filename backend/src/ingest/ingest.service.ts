import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { createHash } from 'crypto';

import { StationAccount } from '../models/StationAccount';
import { safeFolderPath } from './folder-path';
import { Device } from '../models/Device';
import { Organization } from '../models/Organization';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { MetIngestFile } from '../models/MetIngestFile';
import { ParsedMetRow } from './met-csv/parse-met-csv';
import { getStreamParser } from './registry';
import { localDayKey } from '../utils/tz.util';
import { fromCache, toCache } from '../utils/cache.util';
import { IngestFileInput, IngestFileResult, IngestResponse } from './dto';
import { DomainEvent } from '../realtime/realtime.events';

/**
 * Turns raw CSV bytes from the ingest agent into MetRecord + MetMeasure rows.
 *
 * The agent deliberately does not parse: it moves bytes. Parsing here means one
 * implementation to test, a parser fix ships with a backend deploy rather than a
 * fleet-wide agent update, and archived files stay re-ingestable through a
 * corrected parser.
 *
 * Every file gets its own disposition. A batch must never fail wholesale because
 * one file is malformed — one bad file would otherwise block the 59 healthy ones
 * behind it forever.
 */

const STATION_TTL_MS = 60_000;
/** A `pending` row older than this is assumed abandoned by a crashed request. */
const PENDING_TAKEOVER_MS = 90_000;

type LatestRow = Record<string, unknown> & { measuredAtMs: number; recordId: string };
type Extremes = Record<string, { min: number; max: number }>;

/** Fields an alert rule can be built on — see alert-rules/evaluate.ts MET_SENSOR_MAP. */
const ALERTABLE_FIELDS = ['windSpeedMs', 'windDirTrueDeg', 'tempC', 'humidityPct', 'pressureHpa', 'dewPointC'] as const;

interface ResolvedStation {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  timezone: string;
  headingOffsetDeg: number;
  /** Registry key of the parser that reads this station's files. */
  streamType: string;
}

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
   * Resolve the SFTP account to its pre-registered organization and device.
   * Unknown accounts are REJECTED, never auto-created: an attacker-chosen or
   * typo'd account name would otherwise mint an orphan station owned by nobody.
   */
  private async resolveStation(
    account: string,
    folder: string,
    organizationId: string,
  ): Promise<ResolvedStation | null> {
    // The folder is part of the identity, so it is part of the cache key —
    // sharing one entry across towers would route every tower to whichever
    // resolved first.
    //
    // NOTE: this cache also holds `streamType`, so changing a station's stream
    // type takes up to STATION_TTL_MS to take effect. Fine operationally (it is
    // a rare, deliberate change), but it means a change appears not to work for
    // the first minute — which is exactly how it looks when you test it.
    const key = `station:${account}:${folder}`;
    const cached = fromCache<ResolvedStation>(key);
    if (cached) return cached;

    const mapping = await StationAccount.findOne({
      account: account.toLowerCase().trim(),
      folderPath: folder,
      isActive: true,
    }).lean();
    if (!mapping) return null;

    // The credential's organization must own the account it is uploading for.
    if (String(mapping.organizationId) !== organizationId) return null;

    const [device, org] = await Promise.all([
      Device.findOne({ _id: mapping.deviceId, deletedAt: null }).select('name organizationId headingOffsetDeg availableSensors').lean(),
      Organization.findById(mapping.organizationId).select('timezone').lean(),
    ]);
    if (!device) return null;

    const resolved: ResolvedStation = {
      organizationId: String(mapping.organizationId),
      deviceId: String(mapping.deviceId),
      // Which parser reads this station's files. Stored per station because two
      // customers on the same box can send entirely different formats.
      streamType: mapping.streamType || 'met-csv',
      deviceName: device.name,
      timezone: org?.timezone || 'UTC',
      headingOffsetDeg: device.headingOffsetDeg ?? 0,
    };
    return toCache(key, resolved, STATION_TTL_MS);
  }

  /**
   * One MetRecord per station per LOCAL day, created on demand.
   *
   * `dateEndMs` is left null while the day is open: daily-summary.service matches
   * `dateEndMs == null OR >= dayStart`, so a null end keeps the in-progress day
   * visible to the rollup. A too-narrow end would silently produce no summary.
   */
  private async upsertDayRecord(station: ResolvedStation, dayKey: string, firstTsMs: number): Promise<Types.ObjectId> {
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
        source: 'sftp',
        dateStart: new Date(firstTsMs).toISOString(),
        dateStartMs: firstTsMs,
        dateEnd: null,
        dateEndMs: null,
        comment: `SFTP ingest — ${dayKey}`,
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
    return ((relDeg + offsetDeg) % 360 + 360) % 360;
  }

  private toMeasureDocs(
    rows: ParsedMetRow[],
    recordId: Types.ObjectId,
    organizationId: Types.ObjectId,
    headingOffsetDeg: number,
  ) {
    return rows.map((r) => ({
      recordId,
      organizationId,
      rowType: 'data' as const,
      // The raw CSV line, kept verbatim for provenance and re-parsing.
      dataSentence: r.raw,
      timeStamp: new Date(r.timestampMs).toISOString(),
      timestampMs: r.timestampMs,
      source: 'sftp' as const,
      windSpeedMs: r.windSpeedMs,
      windSpeedKmh: r.windSpeedKmh,
      windSpeedKnots: r.windSpeedKnots,
      windDirRelDeg: r.windDirRelDeg,
      // Both are stored: only the wind rose falls back to the relative field —
      // alerts, the gust chart, the CSV export and the compass tile all read true.
      windDirTrueDeg: this.trueBearing(r.windDirRelDeg, headingOffsetDeg),
      tempC: r.tempC,
      humidityPct: r.humidityPct,
      pressureHpa: r.pressureHpa,
      dewPointC: r.dewPointC,
      solarWm2: r.solarWm2,
      precipMm: r.precipMm,
      voltageV: r.voltageV,
      gpsLat: r.gpsLat,
      gpsLng: r.gpsLng,
    }));
  }

  /**
   * Work out what an import WOULD do, without writing anything.
   *
   * The import wizard commits straight to the live dataset, and the two mistakes
   * that hurt are importing the wrong file and importing the same file twice.
   * Both are answerable before the write: the parser says what the file
   * contains, and the content-hash ledger already knows whether these exact
   * bytes have been seen.
   *
   * Deliberately reuses the SAME parser and the SAME hash the real path uses —
   * a dry run computed a different way would be a second implementation to keep
   * in step, and would eventually disagree at the worst moment.
   */
  async dryRunForDevice(organizationId: string, deviceId: string, content: string, filename: string) {
    const station = await this.resolveDevice(organizationId, deviceId);
    if (!station) return { ok: false as const, reason: 'UNKNOWN_DEVICE' as const };

    const parser = getStreamParser(station.streamType);
    if (!parser) return { ok: false as const, reason: 'UNKNOWN_STREAM_TYPE' as const };

    const contentSha256 = createHash('sha256').update(content, 'utf8').digest('hex');
    const already = await MetIngestFile.findOne({
      organizationId: new Types.ObjectId(organizationId),
      deviceId: new Types.ObjectId(deviceId),
      contentSha256,
    })
      .select('state rows receivedAt filename')
      .lean();

    // The admin upload is complete by definition; the SFTP path assumes the
    // opposite, because a missing terminator there means a partial write.
    const parsed = parser.parse(content, { assumeComplete: true });
    if (!parsed.ok || parsed.rows.length === 0) {
      return {
        ok: false as const,
        reason: (parsed.rejectReason ?? 'NO_VALID_ROWS') as string,
        stats: parsed.stats,
      };
    }

    // Which LOCAL days this file touches, and whether each already has a record.
    const dayKeys = [...new Set(parsed.rows.map((r) => localDayKey(r.timestampMs, station.timezone)))].sort();
    const existingDays = await MetRecord.find({
      deviceId: new Types.ObjectId(deviceId),
      dayKey: { $in: dayKeys },
      deletedAt: null,
    })
      .select('dayKey measureCount')
      .lean();
    const byDay = new Map(existingDays.map((d) => [d.dayKey, d.measureCount]));

    return {
      ok: true as const,
      filename,
      deviceId,
      deviceName: station.deviceName,
      timezone: station.timezone,
      streamType: station.streamType,
      /** Already ingested — importing again would insert nothing. */
      duplicateOf: already ? { filename: already.filename, receivedAt: already.receivedAt, rows: already.rows } : null,
      rowsWouldInsert: already ? 0 : parsed.rows.length,
      rowsParsed: parsed.rows.length,
      sensorsSeen: parsed.sensorsSeen,
      unitCode: parsed.unitCode,
      firstTsMs: parsed.stats.firstTsMs,
      lastTsMs: parsed.stats.lastTsMs,
      days: dayKeys.map((k) => ({
        dayKey: k,
        existingMeasures: byDay.get(k) ?? 0,
        action: byDay.has(k) ? ('append' as const) : ('create' as const),
      })),
      stats: parsed.stats,
      /** Nothing was written. Stated so the UI can say so. */
      persisted: false as const,
    };
  }

  async ingestFiles(
    organizationId: string,
    account: string,
    files: IngestFileInput[],
    agentVersion?: string,
    folderRaw?: string,
  ): Promise<IngestResponse> {
    // A traversal or absolute path is rejected outright rather than normalised
    // into something plausible — it could otherwise point a batch at another
    // customer's station.
    const folder = safeFolderPath(folderRaw);
    if (folder === null) {
      return {
        account,
        deviceId: null,
        organizationId,
        results: files.map((f) => ({ name: f.name, status: 'rejected', reason: 'INVALID_FOLDER' })),
      };
    }

    const station = await this.resolveStation(account, folder, organizationId);
    if (!station) {
      return { account, deviceId: null, organizationId, results: files.map((f) => ({ name: f.name, status: 'rejected', reason: 'UNKNOWN_STATION' })) };
    }

    // Request-local, so concurrent batches cannot see each other's rows.
    const latestRef: { value: LatestRow | null } = { value: null };
    const extremes: Extremes = {};
    const results: IngestFileResult[] = [];
    for (const file of files) {
      results.push(await this.ingestOne(station, file, agentVersion, latestRef, extremes));
    }

    await StationAccount.updateOne(
      { account: account.toLowerCase().trim(), folderPath: folder },
      { $set: { lastIngestAt: new Date() } },
    ).catch(
      () => void 0,
    );

    await this.afterBatch(station, results, latestRef.value, extremes);

    return { account, deviceId: station.deviceId, organizationId: station.organizationId, results };
  }

  /**
   * Everything that must happen ONCE per request, not once per file.
   *
   * Emitting per file would be actively harmful: the rollup listener re-reads the
   * whole day on every event, so 1,440 files a day would mean 1,440 full-day
   * recomputes; a catch-up batch would fire hundreds of socket broadcasts; and
   * alert rules would be evaluated hundreds of times for the same reading.
   */
  private async afterBatch(station: ResolvedStation, results: IngestFileResult[], latest: LatestRow | null, extremes: Extremes = {}): Promise<void> {
    const ingested = results.filter((r) => r.status === 'ingested');
    if (ingested.length === 0) return;

    const deviceId = new Types.ObjectId(station.deviceId);

    // ── Device liveness ──────────────────────────────────────────────────
    // Nothing else writes this for an SFTP station. Online status is
    // `lastSeenAt` within 5 minutes (devices.service.ts), and the only previous
    // writer was the mobile heartbeat — so without this the station would render
    // permanently offline while data flowed in perfectly.
    const now = new Date();
    const before = await Device.findOne({ _id: deviceId }).select('lastSeenAt availableSensors reportedSpeedUnit').lean();
    const wasOffline = !(before?.lastSeenAt && now.getTime() - new Date(before.lastSeenAt).getTime() < 5 * 60 * 1000);

    // ── availableSensors ─────────────────────────────────────────────────
    // Union of what this batch actually carried, merged with what we knew.
    // Written only when it changes: an unconditional update would be 1,440
    // pointless writes per station per day.
    const seen = new Set<string>(before?.availableSensors ?? []);
    let grew = false;
    for (const r of ingested) for (const k of r.sensorsSeen ?? []) if (!seen.has(k)) { seen.add(k); grew = true; }

    const update: Record<string, unknown> = { lastSeenAt: now, isOnline: true };
    if (grew) {
      update.availableSensors = [...seen].sort();
      update.sensorsUpdatedAt = now;
    }
    // The unit the station currently reports, for the live tile. Written only on
    // change, for the same reason as availableSensors.
    const unit = ingested.map((r) => r.speedUnitCode).filter(Boolean).pop() ?? null;
    if (unit && unit !== before?.reportedSpeedUnit) update.reportedSpeedUnit = unit;
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

    const dayKeys = [...new Set(ingested.flatMap((r) => r.dayKeys ?? []))].sort();
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
      source: 'sftp',
      timezone: station.timezone,
      // Alert rules evaluate against these, not `latest` — see realtime.events.ts.
      extremes,
    });
  }

  /**
   * Ingest a CSV that was uploaded through the admin panel rather than dropped on
   * SFTP — the manual backfill path.
   *
   * Shares the entire core with the agent path, which is the point. The old
   * `ImportService.importMet` wrote MetRecord and MetMeasure itself and emitted
   * nothing, so a backfilled file produced no realtime push, no daily summary and
   * no alert evaluation. Routing it here fixes all three for free, and picks up
   * content-hash idempotency, local-day records and the shared parser.
   *
   * NOTE ON `source`: rows land as `source: 'sftp'` even though they arrived via
   * the admin panel. That is deliberate — the 30-day TTL is partial on that value,
   * and a backfill of station data should age out on the same schedule. Labelling
   * it differently would exempt it from retention and let it accumulate forever.
   */
  async ingestForDevice(
    organizationId: string,
    deviceId: string,
    filename: string,
    content: string,
  ): Promise<IngestResponse> {
    const station = await this.resolveDevice(organizationId, deviceId);
    if (!station) {
      return { account: deviceId, deviceId: null, organizationId, results: [{ name: filename, status: 'rejected', reason: 'UNKNOWN_DEVICE' }] };
    }
    const latestRef: { value: LatestRow | null } = { value: null };
    const extremes: Extremes = {};
    const result = await this.ingestOne(station, { name: filename, content }, 'admin-upload', latestRef, extremes);
    await this.afterBatch(station, [result], latestRef.value, extremes);
    return { account: deviceId, deviceId: station.deviceId, organizationId: station.organizationId, results: [result] };
  }

  /** Resolve a device directly, for the admin-upload path that has no SFTP account. */
  private async resolveDevice(organizationId: string, deviceId: string): Promise<ResolvedStation | null> {
    if (!Types.ObjectId.isValid(deviceId)) return null;
    const [device, org] = await Promise.all([
      Device.findOne({ _id: new Types.ObjectId(deviceId), organizationId: new Types.ObjectId(organizationId), deletedAt: null })
        .select('name headingOffsetDeg availableSensors')
        .lean(),
      Organization.findById(organizationId).select('timezone').lean(),
    ]);
    if (!device) return null;
    return {
      organizationId,
      deviceId,
      deviceName: device.name,
      timezone: org?.timezone || 'UTC',
      // The admin-upload path has no station account to read a stream type from.
      // MET CSV is the only format an operator can upload through the wizard,
      // and the wizard says so — a different one would need its own entry point.
      streamType: 'met-csv',
      headingOffsetDeg: device.headingOffsetDeg ?? 0,
    };
  }

  private async ingestOne(
    station: ResolvedStation,
    file: IngestFileInput,
    agentVersion: string | undefined,
    latestRef: { value: LatestRow | null },
    extremes: Extremes,
  ): Promise<IngestFileResult> {
    const organizationId = new Types.ObjectId(station.organizationId);
    const deviceId = new Types.ObjectId(station.deviceId);

    // Trust the bytes, not the agent's claim: recompute the hash server-side.
    const contentSha256 = createHash('sha256').update(file.content, 'utf8').digest('hex');
    if (file.sha256 && file.sha256 !== contentSha256) {
      return { name: file.name, status: 'rejected', reason: 'SHA256_MISMATCH' };
    }

    // ── Idempotency ────────────────────────────────────────────────────────
    let marker;
    try {
      marker = await MetIngestFile.create({
        organizationId,
        deviceId,
        filename: file.name,
        contentSha256,
        state: 'pending',
        agentVersion: agentVersion ?? null,
        receivedAt: new Date(),
      });
    } catch (err) {
      const existing = await MetIngestFile.findOne({ organizationId, deviceId, contentSha256 }).lean();
      if (!existing) throw err;

      if (existing.state === 'done') return { name: file.name, status: 'duplicate', rows: existing.rows };
      if (existing.state === 'rejected') {
        return { name: file.name, status: 'rejected', reason: existing.reason ?? 'PREVIOUSLY_REJECTED' };
      }
      // `pending` — either a request still in flight, or one that died.
      const age = Date.now() - new Date(existing.receivedAt).getTime();
      if (age < PENDING_TAKEOVER_MS) return { name: file.name, status: 'retry', reason: 'INGEST_IN_FLIGHT' };

      // Take over. Undo whatever the dead attempt wrote, using its recorded span.
      // This needs no extra field on MetMeasure and reuses the existing
      // { recordId, timestampMs } index — important, because a per-row marker
      // would cost 26 million copies.
      if (existing.recordId && existing.firstTsMs !== null && existing.lastTsMs !== null) {
        const undone = await MetMeasure.deleteMany({
          recordId: existing.recordId,
          source: 'sftp',
          timestampMs: { $gte: existing.firstTsMs, $lte: existing.lastTsMs },
        });
        if (undone.deletedCount) {
          await MetRecord.updateOne({ _id: existing.recordId }, { $inc: { measureCount: -undone.deletedCount } });
        }
      }
      await MetIngestFile.updateOne({ _id: existing._id }, { $set: { state: 'pending', receivedAt: new Date() } });
      marker = await MetIngestFile.findById(existing._id);
      if (!marker) throw err;
    }

    // ── Parse ──────────────────────────────────────────────────────────────
    // `admin-upload` bytes are a whole file the user chose; only the SFTP agent
    // can hand us something cut mid-write.
    // Resolved from the STATION, not hard-coded: this is what lets a new sensor
    // format be onboarded as a registry entry rather than a change here.
    const parser = getStreamParser(station.streamType);
    if (!parser) {
      await MetIngestFile.updateOne(
        { _id: marker._id },
        { $set: { state: 'rejected', reason: 'UNKNOWN_STREAM_TYPE', completedAt: new Date() } },
      );
      return { name: file.name, status: 'rejected', reason: 'UNKNOWN_STREAM_TYPE' };
    }

    const parsed = parser.parse(file.content, { assumeComplete: agentVersion === 'admin-upload' });
    if (!parsed.ok || parsed.rows.length === 0) {
      await MetIngestFile.updateOne(
        { _id: marker._id },
        { $set: { state: 'rejected', reason: parsed.rejectReason ?? 'NO_VALID_ROWS', completedAt: new Date() } },
      );
      return { name: file.name, status: 'rejected', reason: parsed.rejectReason ?? 'NO_VALID_ROWS' };
    }

    // ── Group by LOCAL day ─────────────────────────────────────────────────
    // A file normally covers one minute, but a catch-up batch or a file spanning
    // local midnight can touch two days. Grouping here keeps one record per day.
    const byDay = new Map<string, ParsedMetRow[]>();
    for (const row of parsed.rows) {
      const key = localDayKey(row.timestampMs, station.timezone);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(row);
      else byDay.set(key, [row]);
    }

    let inserted = 0;
    let lastRecordId: Types.ObjectId | null = null;

    for (const [dayKey, rows] of byDay) {
      let first = rows[0].timestampMs;
      for (const r of rows) if (r.timestampMs < first) first = r.timestampMs;

      const recordId = await this.upsertDayRecord(station, dayKey, first);
      lastRecordId = recordId;

      const docs = this.toMeasureDocs(rows, recordId, organizationId, station.headingOffsetDeg);
      // `ordered: false` so one bad document cannot abort the rest of the batch.
      await MetMeasure.insertMany(docs, { ordered: false });
      inserted += docs.length;
      const candidate = this.pickLatest(rows, recordId, station.headingOffsetDeg);
      if (!latestRef.value || candidate.measuredAtMs > latestRef.value.measuredAtMs) latestRef.value = candidate;
      this.accumulateExtremes(rows, station.headingOffsetDeg, extremes);

      // $max / $min widen the day's span commutatively, so out-of-order arrival
      // during a catch-up cannot narrow it.
      let lo = rows[0].timestampMs;
      let hi = rows[0].timestampMs;
      for (const r of rows) {
        if (r.timestampMs < lo) lo = r.timestampMs;
        if (r.timestampMs > hi) hi = r.timestampMs;
      }
      await MetRecord.updateOne(
        { _id: recordId },
        {
          $inc: { measureCount: docs.length },
          $min: { dateStartMs: lo },
          $max: { dateEndMs: hi },
          // Last writer wins. A station that genuinely switches unit mid-day ends
          // the day reporting its current one, which is what the display wants.
          ...(parsed.unitCode ? { $set: { speedUnitCode: parsed.unitCode } } : {}),
        },
      );
    }

    await MetIngestFile.updateOne(
      { _id: marker._id },
      {
        $set: {
          state: 'done',
          recordId: lastRecordId,
          rows: inserted,
          skipped: parsed.stats.skipped,
          firstTsMs: parsed.stats.firstTsMs,
          lastTsMs: parsed.stats.lastTsMs,
          dayKeys: [...byDay.keys()],
          truncated: parsed.stats.truncatedTail,
          completedAt: new Date(),
        },
      },
    );

    return {
      name: file.name,
      status: 'ingested',
      rows: inserted,
      skipped: parsed.stats.skipped,
      dayKeys: [...byDay.keys()],
      truncated: parsed.stats.truncatedTail,
      warnings: parsed.warnings.length,
      sensorsSeen: parsed.sensorsSeen,
      speedUnitCode: parsed.unitCode,
    };
  }
}
