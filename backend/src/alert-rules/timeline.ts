import { AlertCondition, evaluate } from './evaluate';

/** Why a given minute did — or did not — raise an alert. */
export type MinuteReason =
  | 'fired'
  | 'cooldown'
  | 'not_crossed'
  /** Empty, but too recent to call missing — its file may still be on its way. */
  | 'pending'
  | 'no_data'
  | 'paused'
  | 'not_recorded';

/**
 * How long after a minute ends its readings may still legitimately turn up.
 *
 * The station writes one file per minute and the agent holds each one until it
 * looks complete, force-releasing it after its grace period (`OBSERVATOR_LATE_MS`,
 * 5 minutes) — then uploads. So an empty recent minute is normal, and calling it
 * "no readings" states as fact something we do not yet know. Past this window the
 * file really is not coming.
 *
 * Measured after the watcher fix: median delivery is ~2 minutes, so this is
 * deliberately generous rather than tuned to the median.
 */
export const PENDING_WINDOW_MS = 6 * 60_000;

export interface MinuteBucket {
  /** Bucket start, epoch ms (minute-aligned). */
  ts: number;
  /** Readings that landed in this minute. */
  count: number;
  /** The value the evaluator would use, in the sensor's STORED unit. */
  value: number | null;
  /** Same value expressed in the rule's unit — what the operator reads. */
  displayValue: number | null;
  /** Mean over the minute, in the rule's unit. Context, never the trigger. */
  displayAvg: number | null;
  /** Did the value cross the threshold? */
  breached: boolean;
  /** Did the rule actually raise an alert in this minute? */
  fired: boolean;
  reason: MinuteReason;
}

export interface BucketInput {
  ts: number;
  count: number;
  max: number | null;
  min: number | null;
  avg: number | null;
}

/**
 * A rule uses the batch PEAK for "above" conditions and the batch TROUGH for
 * "below" ones (M17 W4). A per-minute reconstruction has to pick the same side,
 * or a gust that fired the alarm would show as a calm average and the timeline
 * would contradict the notification it is meant to explain.
 */
export function evaluatedValue(condition: AlertCondition, b: BucketInput): number | null {
  return condition === 'gt' || condition === 'gte' ? b.max : b.min;
}

/**
 * Explain a window minute by minute.
 *
 * This is a RECONSTRUCTION, not a replay: evaluation runs once per uploaded
 * file against that file's extremes, and the station writes one file per
 * minute — so the two line up closely but are not the same clock. `fired` is
 * therefore taken from the rule's own trigger log rather than recomputed, and
 * only the un-fired minutes are explained.
 *
 * @param fires        Trigger timestamps (epoch ms), any order.
 * @param priorFireMs  Most recent fire STRICTLY BEFORE the window, if known —
 *                     without it, a window that opens mid-cooldown would report
 *                     its suppressed minutes as unexplained.
 */
export function buildTimeline(opts: {
  buckets: BucketInput[];
  condition: AlertCondition;
  thresholdStored: number;
  cooldownMs: number;
  isActive: boolean;
  fires: number[];
  priorFireMs: number | null;
  toDisplay: (storedValue: number) => number | null;
  /** Wall clock. Injected so the pending window is testable. */
  now?: number;
}): MinuteBucket[] {
  const { buckets, condition, thresholdStored, cooldownMs, isActive, toDisplay } = opts;
  const now = opts.now ?? Date.now();
  // A minute is only "missing" once its file can no longer arrive. Measured from
  // the END of the minute, since that is when the station closes the file.
  const settledBefore = now - PENDING_WINDOW_MS;
  const fires = [...opts.fires].sort((a, b) => a - b);
  let lastFireMs = opts.priorFireMs;

  return buckets.map((b) => {
    const value = evaluatedValue(condition, b);
    const firedHere = fires.some((f) => f >= b.ts && f < b.ts + 60_000);
    const breached = value != null && evaluate(condition, value, thresholdStored);

    let reason: MinuteReason;
    if (firedHere) reason = 'fired';
    else if (b.count === 0 || value == null)
      reason = b.ts + 60_000 > settledBefore ? 'pending' : 'no_data';
    else if (!isActive) reason = 'paused';
    else if (!breached) reason = 'not_crossed';
    else if (lastFireMs != null && b.ts - lastFireMs < cooldownMs) reason = 'cooldown';
    else reason = 'not_recorded';

    if (firedHere) lastFireMs = Math.max(lastFireMs ?? 0, ...fires.filter((f) => f >= b.ts && f < b.ts + 60_000));

    return {
      ts: b.ts,
      count: b.count,
      value,
      displayValue: value == null ? null : toDisplay(value),
      displayAvg: b.avg == null ? null : toDisplay(b.avg),
      breached,
      fired: firedHere,
      reason,
    };
  });
}
