/**
 * The query screen's From/To, read in the STATION's timezone.
 *
 * A `datetime-local` input has no zone: the browser would read "09:00" in the
 * viewer's own zone. The data is the station's, so "from 09:00" must mean 09:00
 * where the station is — the same hours for everybody, whichever PC they open it
 * on, and the same hours the CSV's local-time column prints.
 */

/** The zone's UTC offset in minutes at an instant (DST-aware). */
function offsetMinutes(atMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(atMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - atMs) / 60_000);
}

/** `YYYY-MM-DDTHH:mm` wall-clock time in `timeZone` → Unix ms. Null if unparseable. */
export function zonedInputToMs(value: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Two passes, so a time just after a DST change resolves with the new offset.
  const first = asUtc - offsetMinutes(asUtc, timeZone) * 60_000;
  return asUtc - offsetMinutes(first, timeZone) * 60_000;
}

/** Unix ms → `YYYY-MM-DDTHH:mm` wall-clock time in `timeZone`, for the input. */
export function msToZonedInput(ms: number, timeZone: string): string {
  const shifted = new Date(ms + offsetMinutes(ms, timeZone) * 60_000);
  return shifted.toISOString().slice(0, 16);
}
