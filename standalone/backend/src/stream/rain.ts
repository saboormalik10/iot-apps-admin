/**
 * The site's own rain total, whatever the gauge reports.
 *
 * Whether the GMX551 reports rain as a running total (`PRECIPT`) or as the
 * amount since the previous reading is not known until a sensor exists, so it
 * is a setting (`STREAM_RAIN_MODE`). Either way this keeps ONE running total that
 * only ever rises, and that is what is stored as `precipMm`. The rest of the
 * pipeline is unchanged: the daily rollup already sums the rises, and rain in
 * any minute, hour or day is a difference of two totals.
 *
 *  - `total`: the reading is a running total that may reset (power cycle, or a
 *    reset command). Rain since the last reading is the rise; a DROP means the
 *    counter reset, and the new reading is then all rain since the reset. The
 *    usual "sum the positive rises" would lose exactly that part.
 *  - `interval`: each reading is the rain since the previous one.
 *
 * The state survives a restart through `snapshot()`/the constructor, so rain
 * that fell while the PC was off is counted when the stream comes back, rather
 * than silently becoming the new baseline.
 *
 * PLAUSIBILITY. A counter that jumps is not always rain. Found on a live run: the
 * saved state held a gauge reading of ~817 mm, a restarted source began again at
 * 812.4, and the drop was taken as a reset — adding 812.4 mm of "rain" in one
 * minute. So:
 *   - a DROP is a reset only when the new value is small (≤ 10 mm: what can fall
 *     between a reset to zero and the next reading); a drop to a large value is a
 *     different counter, and becomes the new baseline;
 *   - a RISE faster than 10 mm a minute (600 mm/h — no rain on record comes close
 *     for more than moments) is also a different counter, not rain.
 * Both are counted as anomalies and shown on the stream status.
 */

export type RainMode = 'total' | 'interval';

export interface RainState {
  /** The site total, mm. */
  totalMm: number;
  /** The gauge's last raw reading — `total` mode only; null until one arrives. */
  lastRawMm: number | null;
  /** When that reading arrived — so a long outage may legitimately bring a big rise. */
  lastAtMs?: number | null;
}

/** Below this a rise is float noise from the gauge's own rounding, not rain. */
const EPSILON = 1e-6;
/** After a drop, a value this small is rain since a reset to zero; larger is another counter. */
const RESET_MAX_MM = 10;
/** Fastest believable rain. Anything quicker is a counter change, not weather. */
const MAX_MM_PER_MIN = 10;

export class RainAccumulator {
  private totalMm: number;
  private lastRawMm: number | null;
  private lastAtMs: number | null;
  /** Readings rejected as implausible — shown on the stream status. */
  anomalies = 0;
  lastAnomaly: string | null = null;

  constructor(
    private readonly mode: RainMode,
    state: Partial<RainState> = {},
  ) {
    this.totalMm = Number.isFinite(state.totalMm) ? (state.totalMm as number) : 0;
    this.lastRawMm = Number.isFinite(state.lastRawMm) ? (state.lastRawMm as number) : null;
    this.lastAtMs = Number.isFinite(state.lastAtMs) ? (state.lastAtMs as number) : null;
  }

  /** The most rain believable since the previous reading. */
  private allowance(atMs: number): number {
    const minutes = this.lastAtMs === null ? 0 : Math.max(0, (atMs - this.lastAtMs) / 60_000);
    return Math.max(RESET_MAX_MM, MAX_MM_PER_MIN * minutes);
  }

  private anomaly(reason: string): void {
    this.anomalies += 1;
    this.lastAnomaly = reason;
  }

  /**
   * Account for one reading; returns the site total after it.
   *
   * A missing or negative reading adds nothing and returns the unchanged total —
   * rain cannot be negative, and a gap is not a reset.
   */
  update(rawMm: number | null, atMs: number = Date.now()): number {
    if (rawMm === null || !Number.isFinite(rawMm) || rawMm < 0) return this.current;
    const allowed = this.allowance(atMs);

    if (this.mode === 'interval') {
      if (rawMm > allowed) this.anomaly(`${rawMm} mm in one reading is not rain; ignored`);
      else this.totalMm += rawMm;
    } else if (this.lastRawMm === null) {
      // First reading ever: a baseline, not rain. The gauge's counter may hold
      // months of rain from before this software existed.
      this.lastRawMm = rawMm;
    } else {
      const rise = rawMm - this.lastRawMm;
      if (rise > allowed) {
        this.anomaly(`counter jumped ${this.lastRawMm} → ${rawMm} mm; taken as a new counter, not rain`);
      } else if (rise > EPSILON) {
        this.totalMm += rise;
      } else if (rise < -EPSILON) {
        if (rawMm <= RESET_MAX_MM) {
          // Reset to zero: everything it now shows fell after the reset.
          this.totalMm += rawMm;
        } else {
          this.anomaly(`counter dropped ${this.lastRawMm} → ${rawMm} mm; taken as a new counter, not rain`);
        }
      }
      this.lastRawMm = rawMm;
    }
    this.lastAtMs = atMs;
    return this.current;
  }

  /** The site total, to three decimals — the gauge reports no finer. */
  get current(): number {
    return Math.round(this.totalMm * 1000) / 1000;
  }

  snapshot(): RainState {
    return { totalMm: this.current, lastRawMm: this.lastRawMm, lastAtMs: this.lastAtMs };
  }
}
