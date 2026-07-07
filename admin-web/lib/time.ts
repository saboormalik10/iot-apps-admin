/**
 * Time handling (plan §10.1). The backend mixes epoch-ms (numbers) and ISO
 * strings; normalize both to Date, compute/compare in UTC, and DISPLAY in the
 * viewer's local timezone by default (UTC / device-tz modes supported).
 */
export type TimeZoneMode = 'local' | 'utc' | 'device';

export function toDate(value: number | string | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  // Numeric string → epoch ms; otherwise ISO.
  const asNum = Number(value);
  return Number.isFinite(asNum) && /^\d+$/.test(value.trim()) ? new Date(asNum) : new Date(value);
}

interface FormatOptions {
  mode?: TimeZoneMode;
  /** IANA tz used when mode === 'device'. */
  tz?: string;
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle'];
  timeStyle?: Intl.DateTimeFormatOptions['timeStyle'];
}

function resolveTimeZone({ mode = 'local', tz }: FormatOptions): string | undefined {
  if (mode === 'utc') return 'UTC';
  if (mode === 'device' && tz) return tz;
  return undefined; // local
}

export function formatDateTime(value: number | string | Date | null | undefined, opts: FormatOptions = {}): string {
  if (value === null || value === undefined) return '—';
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: opts.dateStyle ?? 'medium',
    timeStyle: opts.timeStyle ?? 'short',
    timeZone: resolveTimeZone(opts),
  }).format(date);
}

export function formatDate(value: number | string | Date | null | undefined, opts: FormatOptions = {}): string {
  if (value === null || value === undefined) return '—';
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: opts.dateStyle ?? 'medium',
    timeZone: resolveTimeZone(opts),
  }).format(date);
}

const RELATIVE_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'seconds' },
  { amount: 60, unit: 'minutes' },
  { amount: 24, unit: 'hours' },
  { amount: 7, unit: 'days' },
  { amount: 4.34524, unit: 'weeks' },
  { amount: 12, unit: 'months' },
  { amount: Number.POSITIVE_INFINITY, unit: 'years' },
];

export function formatRelative(value: number | string | Date | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  let duration = (date.getTime() - Date.now()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return '—';
}
