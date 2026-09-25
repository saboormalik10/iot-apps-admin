/**
 * Per-reading quality control, following WMO-No. 8 Part IV (Quality Management).
 *
 * Pure: no Nest, no database, no I/O. Applied by `IngestService` to whatever the
 * stream parser produced, so every stream type — MET wind, environmental, and
 * anything added to the registry later — is checked by the same rules.
 *
 * WHAT A FAILED CHECK DOES
 *
 * It nulls the offending FIELD and records a code on `row.qc`. It does not drop
 * the row, and it does not touch the other fields:
 *
 *   • Nulling is what makes the exclusion total. `$avg`/`$min`/`$max` already
 *     skip null and missing alike, so a flagged reading leaves every existing
 *     aggregate — the 10-minute mean, the 3-second gust, the daily rollup, the
 *     alert evaluator, the dashboard tiles — without a single query changing.
 *     Sixteen `$match` stages would otherwise each have needed a QC clause, and
 *     the one that got missed would be the one quietly averaging bad data.
 *
 *   • Nothing is lost. `MetMeasure.dataSentence` keeps the raw CSV line verbatim,
 *     so the original value is still on disk and the row can be re-parsed if a
 *     calibration is corrected later. `qc` says which check rejected it and why.
 *
 *   • Per FIELD, not per row: a thermometer that fails its range check must not
 *     remove that second's perfectly good wind reading from the wind rose.
 *
 * WHY THE LIMITS BELOW ARE DELIBERATELY WIDE
 *
 * These are WMO *gross-error* limits — the boundary of the physically possible,
 * not of the locally usual. QC that flags unusual-but-real weather is worse than
 * no QC, because it removes exactly the extremes the station exists to record.
 * Narrowing these to a site's climatology is a per-station judgement and belongs
 * in a later pass, with a human in the loop.
 *
 * The step limits are set from MEASURED data, not from taste. Run
 * `src/scripts/qc-distribution.ts` against live readings before changing one; it
 * prints the observed change-rate percentiles per field. The first draft of this
 * file put the pressure limit at 2 hPa/min, which sat at roughly the 99.87th
 * percentile of the station's own noise — flagging an arbitrary handful of
 * readings while passing thousands of identical ones. A gross-error limit has to
 * sit clear ABOVE the whole observed distribution, or it is just a rate-limiter
 * on a random sample.
 */

import type { ParsedMetRow } from './met-row';

/** Fields QC knows how to check. Anything not listed is passed through untouched. */
export type QcField =
  | 'windSpeedMs'
  | 'windDirRelDeg'
  | 'tempC'
  | 'humidityPct'
  | 'pressureHpa'
  | 'dewPointC'
  | 'solarWm2'
  | 'precipMm';

interface FieldLimits {
  /**
   * Gross-error range. Outside this the reading is physically impossible.
   * `max: null` means there is no upper bound — a running total that only rises.
   */
  min: number;
  max: number | null;
  /**
   * Time-consistency limit: the largest |change| per MINUTE that is physically
   * possible. Null disables the check.
   *
   * Expressed per minute rather than per reading because the two streams sample
   * at very different rates — wind at 1 Hz, environmental at one averaged row a
   * minute. A per-reading limit would be 60x too strict on one of them.
   */
  maxRatePerMin: number | null;
  /**
   * A change this small always passes the step check, however short the gap.
   *
   * The sensor's own resolution flicker. At 1 Hz a thermometer that reads to
   * 0.1 °C ticks between neighbouring values second to second; extrapolated to a
   * rate, one tick is 6 °C/min and would fail a 5 °C/min limit — the GMX551
   * sends temperature every second, and on the first live run this flagged 16 of
   * 39 perfectly normal readings. The floor is several resolution steps and far
   * below any real fault, so a thermometer jumping 3 °C in a second still fails.
   * At the cloud's once-a-minute environmental rows the rate limit dominates and
   * nothing changes.
   */
  stepFloor?: number;
  /**
   * Persistence: a value that has not moved at all for this many minutes is a
   * stuck sensor, not weather. Null disables the check.
   */
  persistMinutes: number | null;
  /**
   * A value that may legitimately sit still forever, exempt from persistence.
   * Calm is genuinely 0.00 m/s for hours; saturated air is genuinely 100 %RH.
   */
  persistExempt?: number;
}

/**
 * The limits, per field.
 *
 * Sources: WMO-No. 8 (Guide to Instruments and Methods of Observation) Part IV
 * for the check design, and its gross-error limits for the ranges.
 */
const LIMITS: Readonly<Record<QcField, FieldLimits>> = Object.freeze({
  // 75 m/s is the WMO gross limit; the highest surface gust ever measured is
  // 113 m/s (Barrow Island, 1996), so this cannot clip real weather here.
  // 1200/min is 20 m/s between consecutive 1 Hz samples — about 4x the fastest
  // second-to-second change observed on live data (5.12 m/s), so real gusts pass.
  windSpeedMs: { min: 0, max: 75, maxRatePerMin: 1200, persistMinutes: 60, persistExempt: 0 },
  // Direction gets NO step or persistence check on purpose. In light air the
  // bearing legitimately swings through 180 degrees between consecutive seconds,
  // and in a steady trade wind it legitimately holds. Both would flag falsely.
  windDirRelDeg: { min: 0, max: 360, maxRatePerMin: null, persistMinutes: null },
  // Observed max on live data: 0.80 °C/min. 5 leaves room for a front while still
  // catching a thermometer that jumps twenty degrees between readings.
  tempC: { min: -80, max: 60, maxRatePerMin: 5, stepFloor: 0.5, persistMinutes: 60 },
  // Observed max 6.41 %/min, and fog forming can genuinely take RH from 60 to
  // 100 inside a couple of minutes — so this sits well above both.
  humidityPct: { min: 0, max: 100, maxRatePerMin: 30, stepFloor: 3, persistMinutes: 60, persistExempt: 100 },
  // Observed max 3.06 hPa/min, which is this barometer's own noise rather than
  // weather — it swings +2.5 and back within minutes, several times a day. The
  // limit is set above that noise floor so it catches a failed sensor, not the
  // sensor's ordinary jitter. Persistence is 120 min, not 60: a stable high
  // really does hold a reading flat at the two decimals the station reports.
  pressureHpa: { min: 500, max: 1100, maxRatePerMin: 10, stepFloor: 0.5, persistMinutes: 120 },
  // Derived from temperature and humidity, so it inherits both flickers: one
  // 0.1 °C and one 1 %RH tick together move it ~0.4 °C.
  dewPointC: { min: -80, max: 60, maxRatePerMin: 5, stepFloor: 1, persistMinutes: 60 },
  // The solar constant is ~1361 W/m²; cloud-edge enhancement can exceed it at
  // the surface, so the gross limit sits above, at 1500.
  solarWm2: { min: 0, max: 1500, maxRatePerMin: null, persistMinutes: null },
  /**
   * The SITE'S RUNNING TOTAL, which only ever rises and is never reset — not a
   * daily figure. So there is no upper bound to check against: the old 2000 mm
   * limit (written for a daily total) would have nulled every reading once the
   * total passed it — about three years at Melbourne's rainfall, sooner at a wet
   * site — and, because a missing value is skipped rather than stored, rain would
   * then have read 0.000 mm for ever. Only "never negative" is a real check.
   * No rate or persistence check either: no rain is the norm.
   */
  precipMm: { min: 0, max: null, maxRatePerMin: null, persistMinutes: null },
});

/**
 * Gill status codes that mean "this reading is good".
 *
 * The WindSonic writes a `status` column: `A` is the NMEA validity flag for a
 * valid sentence, and `00` is the Gill anemometer status word for no fault.
 * Everything else is a reported fault — a blocked axis, a failed self-test, a
 * unit still warming up — and the wind reading that comes with it is not usable.
 */
const STATUS_OK = Object.freeze(new Set(['A', 'OK']));

/**
 * True when a status word says "no fault".
 *
 * Any all-zero word is healthy, whatever its width: the WindSonic writes `00`,
 * and the GMX551 (MaxiMet) writes a four-digit `0000`. Matching only the widths
 * seen so far would null every GMX551 wind reading as a sensor fault.
 */
export function isStatusOk(status: string): boolean {
  const s = status.trim().toUpperCase();
  return /^0+$/.test(s) || STATUS_OK.has(s);
}

/** A reading gap wider than this gives no basis for a step or persistence test. */
/** One reading a second is the sensor's rate; see the step check below. */
const NOMINAL_SAMPLE_MS = 1000;

const MAX_CONTINUITY_GAP_MS = 60 * 60_000;

/** Per-field running state, carried ACROSS files so the checks survive a file boundary. */
export interface QcFieldState {
  lastValue: number;
  lastTsMs: number;
  /** When the current run of identical values began. */
  runStartTsMs: number;
}

/** One station's QC state. Opaque to callers — hand it back on the next batch. */
export type QcState = Partial<Record<QcField, QcFieldState>>;

export interface QcResult {
  /** The same rows, with failed fields nulled and `qc` set where a check failed. */
  rows: ParsedMetRow[];
  /** Carry this into the next call for the same station. */
  state: QcState;
  /** How many rows had at least one field rejected. */
  flaggedRows: number;
  /** Count per code, for the ingest summary and the audit trail. */
  counts: Record<string, number>;
}

const FIELDS = Object.keys(LIMITS) as QcField[];

/**
 * Is this raw sample inside the gross-error range for its field?
 *
 * Exported for callers that AVERAGE before they emit a row — the environmental
 * parser folds a minute of 1 Hz samples into one value, so a single impossible
 * sample would be baked into the mean before `applyQc` ever saw it. One 999 °C
 * sample among 48 shifts a real 11 °C minute by 20 °C: enough to corrupt the
 * reading, not always enough to trip the range check afterwards.
 *
 * This is the range test only. Step and persistence are meaningless on samples
 * within a single averaging window.
 */
export function withinGrossRange(field: QcField, value: number): boolean {
  const limits = LIMITS[field];
  return value >= limits.min && (limits.max === null || value <= limits.max);
}

/**
 * Run QC over one station's rows, in time order.
 *
 * `state` is the tail left by the previous batch for the SAME station. Without
 * it the step and persistence checks would be blind at every file boundary —
 * and the environmental stream puts exactly one row in each file, so they would
 * never fire at all.
 */
export function applyQc(rows: readonly ParsedMetRow[], state: QcState = {}): QcResult {
  const counts: Record<string, number> = {};
  let flaggedRows = 0;

  // Time order is a precondition of both continuity checks, and a catch-up batch
  // can deliver files in any order. Sorting a copy leaves the caller's array —
  // which is grouped into day records downstream — untouched.
  const ordered = [...rows].sort((a, b) => a.timestampMs - b.timestampMs);

  const out = ordered.map((row) => {
    const flags: string[] = [];
    const flag = (code: string) => {
      flags.push(code);
      counts[code] = (counts[code] ?? 0) + 1;
    };

    const next: ParsedMetRow = { ...row };

    // ── 1. The sensor's own verdict ────────────────────────────────────────
    // Checked first and separately: when the instrument reports a fault, its
    // numbers may still look perfectly plausible, so no downstream check would
    // catch them. This is the one test that needs no thresholds at all.
    if (next.status !== null && !isStatusOk(next.status)) {
      flag(`status:${next.status.trim()}`);
      next.windSpeedMs = null;
      next.windSpeedKmh = null;
      next.windSpeedKnots = null;
      next.windDirRelDeg = null;
    }

    for (const field of FIELDS) {
      const limits = LIMITS[field];
      const value = next[field];
      if (value === null || value === undefined) continue;

      // ── 2. Range ─────────────────────────────────────────────────────────
      if (value < limits.min || (limits.max !== null && value > limits.max)) {
        flag(`range:${field}`);
        next[field] = null;
        // Deliberately does NOT update the running state: a rejected value must
        // not become the baseline the next step check measures against, or one
        // spike would flag the good reading that follows it.
        continue;
      }

      const prev = state[field];
      // An out-of-order row has no meaningful predecessor, and a long gap gives
      // the continuity checks nothing to stand on. Both skip rather than guess.
      // Readings are stamped when they arrive (the sensor has no clock), so a
      // converter that buffers through a network stall then dumps its backlog
      // delivers a second's worth of readings milliseconds apart. Measured: wind
      // rose 12% because only the rising half of each cycle survived the step
      // check. The allowance is therefore never computed from less than the
      // nominal one-second sample period.
      const arrivalGapMs = prev ? next.timestampMs - prev.lastTsMs : Infinity;
      const gapMs = arrivalGapMs === Infinity ? Infinity : Math.max(arrivalGapMs, NOMINAL_SAMPLE_MS);
      const continuous = prev !== undefined && gapMs > 0 && gapMs <= MAX_CONTINUITY_GAP_MS;

      let rejected = false;

      // ── 3. Step (time consistency) ───────────────────────────────────────
      if (continuous && limits.maxRatePerMin !== null) {
        const change = Math.abs(value - prev!.lastValue);
        const allowed = Math.max((limits.maxRatePerMin * gapMs) / 60_000, limits.stepFloor ?? 0);
        if (change > allowed) {
          flag(`step:${field}`);
          next[field] = null;
          rejected = true;
        }
      }

      // ── 4. Persistence ───────────────────────────────────────────────────
      // A run is only meaningful if the readings were continuous; a value either
      // side of a two-hour outage is not a two-hour flat line.
      let runStartTsMs = next.timestampMs;
      if (!rejected && continuous) {
        runStartTsMs = value === prev!.lastValue ? prev!.runStartTsMs : next.timestampMs;
        const runMs = next.timestampMs - runStartTsMs;
        if (
          limits.persistMinutes !== null &&
          value !== limits.persistExempt &&
          runMs >= limits.persistMinutes * 60_000
        ) {
          flag(`persist:${field}`);
          next[field] = null;
          rejected = true;
        }
      }

      // The state tracks the last value the sensor ACTUALLY reported and passed,
      // so a stuck sensor keeps failing for as long as it stays stuck, rather
      // than resetting its own run the moment it is first flagged.
      if (!rejected || flags[flags.length - 1] === `persist:${field}`) {
        state[field] = { lastValue: value, lastTsMs: next.timestampMs, runStartTsMs };
      }
    }

    // ── 5. Internal consistency ────────────────────────────────────────────
    // Dew point above air temperature is thermodynamically impossible — it means
    // supersaturation the sensor cannot actually have measured. Both readings
    // survive individually, so only a cross-field test finds it. The dew point
    // is the derived quantity, so it is the one that goes.
    if (next.dewPointC !== null && next.tempC !== null && next.dewPointC > next.tempC + 0.5) {
      flag('consistency:dewPointC>tempC');
      next.dewPointC = null;
    }

    if (flags.length > 0) {
      next.qc = flags;
      flaggedRows += 1;
    }
    return next;
  });

  return { rows: out, state, flaggedRows, counts };
}
