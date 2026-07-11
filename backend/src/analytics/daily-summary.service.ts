import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { MetDailySummary } from '../models/MetDailySummary';
import { NepDailySummary } from '../models/NepDailySummary';
import { DomainEvent, MetMeasuresEvent, NepSessionCompletedEvent } from '../realtime/realtime.events';
import {
  DAY_MS,
  dayBounds,
  daysInSpan,
  computeMetDaily,
  computeNepDaily,
} from './daily-summary.util';

const MET_FIELDS =
  'timestampMs windSpeedMs windDirTrueDeg windDirRelDeg tempC humidityPct pressureHpa precipMm precipRateMmHr solarWm2 dewPointC';

/**
 * Populates + reads the daily-summary rollups (§10.7). Population is an idempotent
 * per-(deviceId, dateMs) upsert, triggered incrementally off ingest events and by a
 * one-off backfill script. Reads back the org-scoped summaries for the analytics UI.
 *
 * No injected dependencies (it uses the raw Mongoose models like AnalyticsService),
 * so the backfill script can `new DailySummaryService()` directly.
 */
@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger(DailySummaryService.name);

  // ── Incremental triggers (decoupled: services emit, we recompute) ──────────

  @OnEvent(DomainEvent.MET_MEASURES)
  async onMetMeasures(e: MetMeasuresEvent): Promise<void> {
    const ts = (e.latest?.measuredAtMs as number) ?? Date.now();
    try {
      await this.populateMetDay(e.organizationId, e.deviceId, dayBounds(ts).dayStartMs);
    } catch (err) {
      // Never let a rollup failure break ingestion.
      this.logger.warn(`MET daily-summary populate failed (device ${e.deviceId}): ${String(err)}`);
    }
  }

  @OnEvent(DomainEvent.NEP_SESSION_COMPLETED)
  async onNepSessionCompleted(e: NepSessionCompletedEvent): Promise<void> {
    try {
      const session = await NepSession.findOne({ id: e.sessionId }).select('startTimestamp endTimestamp').lean();
      if (!session) return;
      const days = daysInSpan(session.startTimestamp, session.endTimestamp ?? session.startTimestamp);
      for (const dayStartMs of days) await this.populateNepDay(e.organizationId, e.deviceId, dayStartMs);
    } catch (err) {
      this.logger.warn(`NEP daily-summary populate failed (device ${e.deviceId}): ${String(err)}`);
    }
  }

  // ── Populators (idempotent upserts) ────────────────────────────────────────

  /** Recompute + upsert one MET day. Returns null when the day has no data rows. */
  async populateMetDay(orgId: string, deviceId: string, dayStartMs: number) {
    const dayEndMs = dayStartMs + DAY_MS;
    const records = await MetRecord.find({
      organizationId: new Types.ObjectId(orgId),
      deviceId: new Types.ObjectId(deviceId),
      deletedAt: null,
      isDemoMode: false,
      dateStartMs: { $lt: dayEndMs },
      $or: [{ dateEndMs: null }, { dateEndMs: { $gte: dayStartMs } }],
    })
      .select('_id')
      .lean();
    if (!records.length) return null;

    const rows = await MetMeasure.find({
      recordId: { $in: records.map((r) => r._id) },
      rowType: 'data',
      timestampMs: { $gte: dayStartMs, $lt: dayEndMs },
    })
      .select(MET_FIELDS)
      .lean();
    if (!rows.length) return null;

    const computed = computeMetDaily(rows, dayStartMs, dayEndMs, Date.now());
    const { date } = dayBounds(dayStartMs);
    return MetDailySummary.findOneAndUpdate(
      { deviceId: new Types.ObjectId(deviceId), dateMs: dayStartMs },
      { $set: { ...computed, organizationId: new Types.ObjectId(orgId), date, dateMs: dayStartMs, computedAt: new Date() } },
      { upsert: true, new: true },
    ).lean();
  }

  /** Recompute + upsert one NEP day. Returns null when the day has no samples. */
  async populateNepDay(orgId: string, deviceId: string, dayStartMs: number) {
    const dayEndMs = dayStartMs + DAY_MS;
    const sessions = await NepSession.find({
      organizationId: new Types.ObjectId(orgId),
      deviceId: new Types.ObjectId(deviceId),
      deletedAt: null,
      isDemoMode: false,
      startTimestamp: { $lt: dayEndMs },
      $or: [{ endTimestamp: null }, { endTimestamp: { $gte: dayStartMs } }],
    })
      .select('id')
      .lean();
    if (!sessions.length) return null;

    const rows = await NepSample.find({
      sessionId: { $in: sessions.map((s) => s.id) },
      timestamp: { $gte: dayStartMs, $lt: dayEndMs },
    })
      .select('sessionId turbidityValue temperatureValue probeRange')
      .lean();
    if (!rows.length) return null;

    const distinctSessions = new Set(rows.map((r) => r.sessionId)).size;
    const computed = computeNepDaily(rows, distinctSessions);
    const { date } = dayBounds(dayStartMs);
    return NepDailySummary.findOneAndUpdate(
      { deviceId: new Types.ObjectId(deviceId), dateMs: dayStartMs },
      { $set: { ...computed, organizationId: new Types.ObjectId(orgId), date, dateMs: dayStartMs, computedAt: new Date() } },
      { upsert: true, new: true },
    ).lean();
  }

  // ── Reads (org-scoped; deviceId required, like the other analytics endpoints) ─

  async getMetDailySummaries(orgId: string, deviceId: string, from?: string, to?: string) {
    const { fromDayMs, toMs } = this.parseRange(deviceId, from, to);
    return MetDailySummary.find({
      organizationId: new Types.ObjectId(orgId),
      deviceId: new Types.ObjectId(deviceId),
      dateMs: { $gte: fromDayMs, $lte: toMs },
    })
      .sort({ dateMs: 1 })
      .lean();
  }

  async getNepDailySummaries(orgId: string, deviceId: string, from?: string, to?: string) {
    const { fromDayMs, toMs } = this.parseRange(deviceId, from, to);
    return NepDailySummary.find({
      organizationId: new Types.ObjectId(orgId),
      deviceId: new Types.ObjectId(deviceId),
      dateMs: { $gte: fromDayMs, $lte: toMs },
    })
      .sort({ dateMs: 1 })
      .lean();
  }

  /** Default range = last 30 days; validates deviceId + numeric window. */
  private parseRange(deviceId: string, from?: string, to?: string): { fromDayMs: number; toMs: number } {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const toMs = to ? parseInt(to, 10) : Date.now();
    const fromMs = from ? parseInt(from, 10) : toMs - 30 * DAY_MS;
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new BadRequestException('Invalid from/to (Unix ms expected)');
    return { fromDayMs: Math.floor(fromMs / DAY_MS) * DAY_MS, toMs };
  }
}
