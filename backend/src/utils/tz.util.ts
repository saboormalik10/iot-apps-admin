/**
 * Local-day arithmetic for a named IANA timezone.
 *
 * The existing `dayBounds` in analytics/daily-summary.util.ts is pure UTC
 * (`Math.floor(ts / DAY_MS) * DAY_MS`). That is wrong for a customer: the station
 * is in Sydney (UTC+10/+11), so a UTC day boundary cuts their day at 10am and a
 * "daily maximum gust" would span two of their afternoons.
 *
 * Two further traps this handles that fixed-offset arithmetic cannot:
 *   - Sydney observes DST, so the offset is +10 or +11 depending on the date.
 *   - Two days a year are 23 and 25 hours long, not 24.
 *
 * No new dependency: Node 20 ships full ICU, so `Intl.DateTimeFormat` resolves
 * real zone rules including historical DST transitions.
 */

/** `en-CA` formats as YYYY-MM-DD natively, which is the key format we want. */
const KEY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function keyFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = KEY_FORMATTERS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    KEY_FORMATTERS.set(timeZone, f);
  }
  return f;
}

/** True when the string names a zone this runtime can resolve. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The local calendar date at `tsMs` in `timeZone`, as `YYYY-MM-DD`.
 * This is the `dayKey` that groups a station's measures into one MetRecord.
 */
export function localDayKey(tsMs: number, timeZone: string): string {
  return keyFormatter(timeZone).format(new Date(tsMs));
}

/**
 * The UTC offset in minutes that `timeZone` was observing at `tsMs`.
 * Derived by formatting the instant as if it were UTC and differencing — the
 * standard trick, and correct across DST because it asks the zone at that instant.
 */
function offsetMinutesAt(tsMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(tsMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  // `hour` can format as 24 for midnight under hour12:false in some ICU versions.
  const hour = get('hour') % 24;
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return Math.round((asUtc - tsMs) / 60_000);
}

/**
 * Start and end instants of a local calendar day.
 *
 * Two-pass: guess using the offset at local noon (never ambiguous, even on a DST
 * day), then re-resolve at the resulting boundary. The second pass is what makes
 * the 23- and 25-hour days come out right.
 */
export function localDayBounds(dayKey: string, timeZone: string): { startMs: number; endMs: number } {
  const [y, m, d] = dayKey.split('-').map(Number);
  const noonUtcGuess = Date.UTC(y, m - 1, d, 12, 0, 0);

  const resolveStart = (year: number, month: number, day: number): number => {
    const guessOffset = offsetMinutesAt(Date.UTC(year, month - 1, day, 12, 0, 0), timeZone);
    const firstPass = Date.UTC(year, month - 1, day, 0, 0, 0) - guessOffset * 60_000;
    const actualOffset = offsetMinutesAt(firstPass, timeZone);
    return Date.UTC(year, month - 1, day, 0, 0, 0) - actualOffset * 60_000;
  };

  const startMs = resolveStart(y, m, d);
  const next = new Date(noonUtcGuess + 24 * 60 * 60 * 1000);
  const endMs = resolveStart(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());

  return { startMs, endMs };
}

/** Every local day key touched by the span, inclusive. */
export function localDaysInSpan(fromMs: number, toMs: number, timeZone: string): string[] {
  if (toMs < fromMs) return [];
  const keys: string[] = [];
  let cursor = fromMs;
  const last = localDayKey(toMs, timeZone);

  // Walk day by day. Bounded by the span, and each step lands inside the next
  // local day regardless of DST length.
  for (let guard = 0; guard < 4000; guard++) {
    const key = localDayKey(cursor, timeZone);
    keys.push(key);
    if (key === last) break;
    cursor = localDayBounds(key, timeZone).endMs;
    if (cursor > toMs) {
      const tail = localDayKey(toMs, timeZone);
      if (tail !== key) keys.push(tail);
      break;
    }
  }
  return keys;
}
