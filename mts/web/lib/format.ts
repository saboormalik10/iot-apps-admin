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
    hour12: false,
    timeZone: TZ,
  });
}

export function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
}

export function fmtDateTime(t: number): string {
  return new Date(t).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  });
}

/** Midnight in Sydney on the day `t` falls in — day bins follow the corridor's calendar, not UTC's. */
export function sydneyMidnight(t: number): number {
  // toLocaleString drops milliseconds; take them off `t` too, or "midnight"
  // lands a few hundred ms off and day bins split.
  const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: TZ }));
  return t - (d.getHours() * 3_600_000 + d.getMinutes() * 60_000 + d.getSeconds() * 1_000) - (t % 1000);
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
