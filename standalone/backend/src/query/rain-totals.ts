import { Types } from 'mongoose';
import { MetRecord } from '../models/MetRecord';
import { MetMeasure } from '../models/MetMeasure';
import { dayStartAt } from '../utils/tz.util';

/**
 * Rain for any window, from the stored running total.
 *
 * Each minute record's `precipMm` is the SITE's running total at the end of that
 * minute (stream/rain.ts): it starts at 0 when the software first sees the gauge
 * and only ever rises, whatever the gauge's own counter does. So rain in any
 * window is simply the total at its end minus the total just before it — one
 * indexed lookup each, however long the window.
 *
 * `rise` still treats a drop as a reset, rather than returning negative rain, in
 * case a total is ever stored out of that rule (a restored database, say).
 */

/** Every day record of a station — the minute rows hang off these, not off the device. */
export async function stationRecordIds(deviceId: Types.ObjectId): Promise<Types.ObjectId[]> {
  const records = await MetRecord.find({ deviceId, deletedAt: null }).select('_id').lean();
  return records.map((r) => r._id as Types.ObjectId);
}

/** The running total at the end of the last minute before `tsMs`, or null if none. */
export async function totalBefore(recordIds: Types.ObjectId[], tsMs: number): Promise<number | null> {
  if (recordIds.length === 0) return null;
  const row = await MetMeasure.findOne({
    recordId: { $in: recordIds },
    res: '1m',
    timestampMs: { $lt: tsMs },
    precipMm: { $ne: null },
  })
    .sort({ timestampMs: -1 })
    .select('precipMm')
    .lean();
  return row?.precipMm ?? null;
}

/**
 * Rain between two totals, mm.
 *
 * No earlier total means the window starts at the beginning of the record, and
 * the site total began at 0 — so everything up to `total` fell in it. A total
 * LOWER than the one before it can only be a reset, and then everything it now
 * shows fell after that reset.
 */
export function rise(before: number | null, total: number | null): number | null {
  if (total === null) return null;
  if (before === null) return round3(total);
  return round3(total >= before ? total - before : total);
}

/**
 * The last total stored for a station — to carry on from after a restart.
 *
 * Bounded at "now": if the PC's clock was ever ahead, rows carry future
 * timestamps (the System page warns about exactly that), and the accumulator
 * would otherwise restart from one of those rather than from today's real total.
 */
export async function lastStoredRainTotal(deviceId: Types.ObjectId, nowMs = Date.now()): Promise<number | null> {
  return totalBefore(await stationRecordIds(deviceId), nowMs + 60_000);
}

export interface RainSummary {
  /** Since the station's rain day began (midnight, or e.g. 9am). */
  todayMm: number | null;
  /** When that rain day began. */
  dayStartMs: number;
  rainDayStartHour: number;
  lastHourMm: number | null;
  /** Over the last 10 minutes, as mm per hour — one 0.2 mm tip in a minute would read as 12 mm/h. */
  rateMmHr: number | null;
}

/**
 * The dashboard's rain figures. Null when the station has never reported rain —
 * a station without a gauge, whose rain tiles are then not shown at all.
 */
export async function rainSummary(
  deviceId: Types.ObjectId,
  timeZone: string,
  rainDayStartHour: number,
  nowMs = Date.now(),
): Promise<RainSummary> {
  const recordIds = await stationRecordIds(deviceId);
  const { startMs } = dayStartAt(nowMs, rainDayStartHour, timeZone);
  // The current minute is still being collected, but a written one may be ahead
  // of the clock by up to a minute; this includes every minute written so far.
  const end = nowMs + 60_000;
  const [now, atDayStart, hourAgo, tenAgo] = await Promise.all([
    totalBefore(recordIds, end),
    totalBefore(recordIds, startMs),
    totalBefore(recordIds, nowMs - 60 * 60_000),
    totalBefore(recordIds, nowMs - 10 * 60_000),
  ]);
  const tenMin = rise(tenAgo, now);
  return {
    todayMm: rise(atDayStart, now),
    dayStartMs: startMs,
    rainDayStartHour,
    lastHourMm: rise(hourAgo, now),
    rateMmHr: tenMin === null ? null : round3(tenMin * 6),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
