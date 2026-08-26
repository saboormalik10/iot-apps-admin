import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { MetRecord } from '../models/MetRecord';
import { Device } from '../models/Device';
import { MetMeasure } from '../models/MetMeasure';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';
import { MetDailySummary } from '../models/MetDailySummary';
import { NepDailySummary } from '../models/NepDailySummary';
import { localDayBounds, localDayKey } from '../utils/tz.util';
import { Organization } from '../models/Organization';
import { computeMetDailyAggregated } from './daily-summary-agg';
import { DomainEvent, MetMeasuresEvent, NepSessionCompletedEvent } from '../realtime/realtime.events';
import {
  DAY_MS,
  dayBounds,
  daysInSpan,
  computeNepDaily,
  MetDailyComputed,
} from './daily-summary.util';


/**
 * Populates + reads the daily-summary rollups (§10.7). Population is an idempotent
 * per-(deviceId, dateMs) upsert, triggered incrementally off ingest events and by a
 * one-off backfill script. Reads back the org-scoped summaries for the analytics UI.
 *
 * No injected dependencies (it uses the raw Mongoose models like AnalyticsService),
 * so the backfill script can `new DailySummaryService()` directly.
 */
/** Sensors are judged over a week, not a single day — see rewriteAvailableSensors. */
const SENSOR_WINDOW_DAYS = 7;

@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger(DailySummaryService.name);

  /**
   * Coalesced rollup requests, keyed by device+day.
   *
   * Without this the rollup runs once per agent POST — 1,440 times a day per
   * station, each one recomputing the entire day. Measured at 9.5s per full-day
   * recompute, that is four hours of CPU per station per day.
   *
   * Trailing debounce with a ceiling: a burst collapses to one run, but a busy
   * station still gets refreshed at least every MAX_DELAY_MS rather than being
   * starved by continuous traffic.
   */
  private readonly pending = new Map<string, { timer: NodeJS.Timeout; firstQueuedAt: number; run: () => Promise<void> }>();
  private static readonly DEBOUNCE_MS = 60_000;
  private static readonly MAX_DELAY_MS = 300_000;

  private schedule(key: string, run: () => Promise<void>): void {
    const existing = this.pending.get(key);
    const firstQueuedAt = existing?.firstQueuedAt ?? Date.now();

    if (existing) {
      clearTimeout(existing.timer);
      // Ceiling reached — run now rather than deferring again.
      if (Date.now() - firstQueuedAt >= DailySummaryService.MAX_DELAY_MS) {
        this.pending.delete(key);
        void run().catch((err) => this.logger.warn(`rollup ${key} failed: ${String(err)}`));
        return;
      }
    }

    const timer = setTimeout(() => {
      this.pending.delete(key);
      void run().catch((err) => this.logger.warn(`rollup ${key} failed: ${String(err)}`));
    }, DailySummaryService.DEBOUNCE_MS);
    // Do not hold the process open for a pending rollup.
    timer.unref?.();
    this.pending.set(key, { timer, firstQueuedAt, run });
  }

  /** Flush every queued rollup immediately — used by tests and on shutdown. */
  async flushPending(): Promise<void> {
    const entries = [...this.pending.entries()];
    this.pending.clear();
    for (const [, v] of entries) {
      clearTimeout(v.timer);
      await v.run().catch(() => void 0);
    }
  }

  // ── Incremental triggers (decoupled: services emit, we recompute) ──────────

  @OnEvent(DomainEvent.MET_MEASURES)
  async onMetMeasures(e: MetMeasuresEvent): Promise<void> {
    try {
      // Roll up EVERY day the batch touched. Using only the day containing
      // `latest` meant a catch-up batch spanning an outage recomputed just its
      // final day and left the rest stale — silently, because the summary rows
      // for those days simply never appeared.
      if (e.dayKeys?.length && e.timezone) {
        for (const dayKey of e.dayKeys) {
          const { startMs, endMs } = localDayBounds(dayKey, e.timezone);
          this.schedule(`${e.deviceId}:${dayKey}`, () =>
            this.populateMetDay(e.organizationId, e.deviceId, startMs, endMs, dayKey).then(() => void 0),
          );
        }
        return;
      }
      const ts = (e.latest?.measuredAtMs as number) ?? Date.now();
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
  async populateMetDay(orgId: string, deviceId: string, dayStartMs: number, explicitEndMs?: number, explicitDate?: string) {
    // A LOCAL day is not always 24 hours: the two DST transition days are 23 and
    // 25. Callers that know the zone pass real bounds; everything else keeps the
    // original UTC behaviour.
    const dayEndMs = explicitEndMs ?? dayStartMs + DAY_MS;
    const records = await MetRecord.find({
      organizationId: new Types.ObjectId(orgId),
      deviceId: new Types.ObjectId(deviceId),
      deletedAt: null,
      dateStartMs: { $lt: dayEndMs },
      $or: [{ dateEndMs: null }, { dateEndMs: { $gte: dayStartMs } }],
    })
      .select('_id')
      .lean();
    if (!records.length) return null;

    // Computed inside MongoDB. Loading the day into Node took 8-9.5s on a real
    // 1 Hz day, dominated by per-document round-tripping rather than arithmetic.
    // Output is asserted identical to computeMetDaily in
    // test/daily-summary-agg.e2e-spec.ts.
    const computed = await computeMetDailyAggregated(
      records.map((r) => r._id as Types.ObjectId),
      dayStartMs,
      dayEndMs,
      Date.now(),
    );
    if (!computed) return null;
    const date = explicitDate ?? dayBounds(dayStartMs).date;

    // Self-heal Device.availableSensors from what this day actually contained.
    //
    // The ingest path can only ADD to that list — it sees one file at a time and
    // has no way to know a sensor has stopped reporting. So a decommissioned
    // sensor, or one bad file that briefly carried a stray column, would sit in
    // the list forever and keep an empty panel on the dashboard.
    //
    // The rollup is the right place to correct it: it already has the whole day
    // in view, and it runs on a debounce rather than per file.
    void this.rewriteAvailableSensors(deviceId, computed).catch(() => void 0);

    return MetDailySummary.findOneAndUpdate(
      // Keyed on the local date string — see the index comment in the model.
      { deviceId: new Types.ObjectId(deviceId), date },
      { $set: { ...computed, organizationId: new Types.ObjectId(orgId), date, dateMs: dayStartMs, computedAt: new Date() } },
      { upsert: true, new: true },
    ).lean();
  }

  /**
   * Rewrite Device.availableSensors from a completed day's rollup.
   *
   * Uses `$set`, not `$addToSet`: the point is that the list can SHRINK. Skips
   * the write when nothing changed, so a station reporting the same sensors every
   * day costs one comparison rather than one write per rollup.
   */
  private async rewriteAvailableSensors(deviceId: string, _computed: MetDailyComputed): Promise<void> {
    // Derived over a WINDOW, not the single day just rolled up.
    //
    // One day is not evidence a sensor is gone. A wind station in calm conditions
    // reports speed but no bearing for the whole day, so a single-day rewrite
    // would drop `wind_dir` and hide the wind rose — then restore it the next
    // breezy day. Seven days of summaries smooths that out while still letting a
    // genuinely decommissioned sensor fall off within a week.
    const since = Date.now() - SENSOR_WINDOW_DAYS * DAY_MS;
    const days = await MetDailySummary.find({ deviceId: new Types.ObjectId(deviceId), dateMs: { $gte: since } })
      .select('windSpeedAvgMs windDirPrevailing tempAvgC humidityAvgPct pressureAvgHpa dewPointAvgC solarAvgWm2 precipTotalMm')
      .lean();
    if (days.length === 0) return;

    const any = (key: string) => days.some((d) => (d as Record<string, unknown>)[key] !== null && (d as Record<string, unknown>)[key] !== undefined);
    const present: string[] = [];
    if (any('windSpeedAvgMs')) present.push('wind_speed');
    if (any('windDirPrevailing')) present.push('wind_dir');
    if (any('tempAvgC')) present.push('temperature');
    if (any('humidityAvgPct')) present.push('humidity');
    if (any('pressureAvgHpa')) present.push('pressure');
    if (any('dewPointAvgC')) present.push('dew_point');
    if (any('solarAvgWm2')) present.push('solar');
    if (any('precipTotalMm')) present.push('precipitation');
    present.sort();

    // No readings anywhere in the window says nothing about capabilities.
    if (present.length === 0) return;

    const device = await Device.findById(deviceId).select('availableSensors').lean();
    const current = [...(device?.availableSensors ?? [])].sort();
    if (current.length === present.length && current.every((v, i) => v === present[i])) return;

    await Device.updateOne(
      { _id: new Types.ObjectId(deviceId) },
      { $set: { availableSensors: present, sensorsUpdatedAt: new Date() } },
    );
    this.logger.log(`device ${deviceId} sensors → [${present.join(', ')}]`);
  }

  /** Recompute + upsert one NEP day. Returns null when the day has no samples. */
  async populateNepDay(orgId: string, deviceId: string, dayStartMs: number) {
    const dayEndMs = dayStartMs + DAY_MS;
    const sessions = await NepSession.find({
      organizationId: new Types.ObjectId(orgId),
      deviceId: new Types.ObjectId(deviceId),
      deletedAt: null,
      // Same as populateMetDay: keyed by device, so demo rolls up separately.
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
    const { fromDayKey, toDayKey } = await this.parseRange(orgId, deviceId, from, to);
    return MetDailySummary.find({
      organizationId: new Types.ObjectId(orgId),
      deviceId: new Types.ObjectId(deviceId),
      date: { $gte: fromDayKey, $lte: toDayKey },
    })
      .sort({ date: 1 })
      .lean();
  }

  async getNepDailySummaries(orgId: string, deviceId: string, from?: string, to?: string) {
    // NEP summaries are keyed on UTC days — they come from the mobile-era path,
    // which has no station timezone to speak of. Kept on the original arithmetic
    // deliberately rather than being forced through the local-day helper.
    const { fromDayMs, toMs } = this.parseUtcRange(deviceId, from, to);
    return NepDailySummary.find({
      organizationId: new Types.ObjectId(orgId),
      deviceId: new Types.ObjectId(deviceId),
      dateMs: { $gte: fromDayMs, $lte: toMs },
    })
      .sort({ dateMs: 1 })
      .lean();
  }

  /** Default range = last 30 days; validates deviceId + numeric window. */
  /** UTC-day range, for the NEP summaries that are still keyed that way. */
  private parseUtcRange(deviceId: string, from?: string, to?: string): { fromDayMs: number; toMs: number } {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const toMs = to ? parseInt(to, 10) : Date.now();
    const fromMs = from ? parseInt(from, 10) : toMs - 30 * DAY_MS;
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new BadRequestException('Invalid from/to (Unix ms expected)');
    return { fromDayMs: Math.floor(fromMs / DAY_MS) * DAY_MS, toMs };
  }

  /**
   * Resolve a from/to range to LOCAL day keys.
   *
   * The previous version quantised with `Math.floor(fromMs / DAY_MS) * DAY_MS`,
   * i.e. to UTC midnight, and compared that against a stored `dateMs` that is
   * LOCAL midnight. For a +10 offset local midnight is 14:00 the previous UTC
   * day, so asking for "from UTC midnight of the 18th" excluded the 18th's own
   * summary. Verified against the live database: 5 of 6 summaries returned, with
   * the first day silently missing.
   *
   * Comparing 'YYYY-MM-DD' strings sidesteps the arithmetic entirely — ISO dates
   * sort lexicographically, and the boundary is whatever the organisation calls
   * a day.
   */
  private async parseRange(
    organizationId: string,
    deviceId: string,
    from?: string,
    to?: string,
  ): Promise<{ fromDayKey: string; toDayKey: string }> {
    if (!deviceId) throw new BadRequestException('deviceId is required');
    const toMs = to ? parseInt(to, 10) : Date.now();
    const fromMs = from ? parseInt(from, 10) : toMs - 30 * DAY_MS;
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new BadRequestException('Invalid from/to (Unix ms expected)');

    const org = await Organization.findById(organizationId).select('timezone').lean();
    const tz = org?.timezone || 'UTC';
    return { fromDayKey: localDayKey(fromMs, tz), toDayKey: localDayKey(toMs, tz) };
  }
}
