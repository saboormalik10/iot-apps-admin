/**
 * Formatting, in one place.
 *
 * Two reasons it is not scattered: a missing reading must render as an em dash and
 * never as a fake `0` — on a flood screen those mean opposite things — and adding
 * a translation layer later is then mechanical rather than archaeological.
 */

const TZ = 'Australia/Sydney';

export const EMPTY = '–';

/** A reading, with its unit kept separate so it can be styled smaller. */
export function fmtValue(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return value.toLocaleString('en-AU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Whole numbers: levels in mm, counts, percentages. */
export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  return Math.round(value).toLocaleString('en-AU');
}

/** Water level is signed against the rail-foot datum: +120 mm reads differently to 120. */
export function fmtSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY;
  const r = Math.round(value);
  return r > 0 ? `+${r}` : String(r);
}

export function fmtClock(t: number): string {
  return new Date(t).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: TZ,
  });
}

export function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });
}

export function fmtDateTime(t: number): string {
  return new Date(t).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TZ,
  });
}

/** Sydney wall-clock minutes past midnight. */
function wallMinutes(t: number): number {
  const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: TZ }));
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Midnight in Sydney on the day `t` falls in — day bins follow the corridor's
 * calendar, not UTC's. DST-correct: on a changeover day the wall clock skips or
 * repeats an hour, so the first guess is read back and corrected.
 */
export function sydneyMidnight(t: number): number {
  // toLocaleString drops milliseconds; take them off `t` too, or "midnight"
  // lands a few hundred ms off and day bins split.
  const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: TZ }));
  const guess = t - (d.getHours() * 3_600_000 + d.getMinutes() * 60_000 + d.getSeconds() * 1_000) - (t % 1000);
  let off = wallMinutes(guess);
  if (off > 720) off -= 1440;
  return guess - off * 60_000;
}

/** "AEST" or "AEDT" — Sydney is on daylight time from the first Sunday of October. */
export function sydneyZone(t: number): string {
  const part = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, timeZoneName: 'short' })
    .formatToParts(new Date(t))
    .find((p) => p.type === 'timeZoneName')?.value;
  return part === 'AEDT' || part === 'AEST' ? part : (part ?? 'AEST');
}

/**
 * Axis ticks on the Sydney wall clock: every `stepMin` minutes on the clock face,
 * from midnight. Stepping a fixed number of milliseconds put the ticks on 13:00
 * and 01:00 for the rest of the axis once the clocks went forward.
 */
export function wallClockTicks(from: number, to: number, stepMin: number): number[] {
  const ticks: number[] = [];
  if (stepMin >= 1440) {
    // Whole days: one tick per Sydney midnight, every n days.
    const n = Math.round(stepMin / 1440);
    let i = 0;
    for (let d = sydneyMidnight(from); d <= to; d = sydneyMidnight(d + 30 * 3_600_000), i++) {
      if (d >= from && i % n === 0) ticks.push(d);
    }
    return ticks;
  }
  /* Walk the clock-face grid in the finer of the step and an hour; keep the
     instants whose wall-clock minute lands on the step. */
  const walk = Math.min(stepMin, 60) * 60_000;
  for (let t = sydneyMidnight(from); t <= to; t += walk) {
    if (t >= from && wallMinutes(t) % stepMin === 0) ticks.push(t);
  }
  return ticks;
}

/** "01 Oct" — for an axis of days. */
export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', timeZone: TZ });
}

export function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });
}

/** "4 minutes ago", "now" — what a control room reads on a status line. */
export function fmtRelative(t: number, from: number): string {
  const s = Math.max(0, Math.round((from - t) / 1000));
  if (s < 10) return 'now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** "3.2 h", "9h15m" — pump run times. */
export function fmtDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  // Past a day, hours and minutes stop being readable: "305h 12m" is 12 days.
  if (h >= 24) return h % 24 === 0 ? `${h / 24} d` : `${Math.floor(h / 24)} d ${h % 24} h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
