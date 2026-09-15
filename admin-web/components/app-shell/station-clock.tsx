'use client';

import { useEffect, useState } from 'react';

import { useOrg } from '@/features/org/use-org';
import { zoneLabel } from '@/lib/time/zone-label';

/**
 * Live clock in the top bar: the station's local time and UTC, side by side.
 *
 * WHY BOTH, AND WHY NOT THE BROWSER'S CLOCK
 * Every reading in this portal is stamped in the STATION's timezone, and the
 * people reading it are not always in that timezone — the stations are in
 * Australia and the customer is not. A clock showing the viewer's local time
 * would therefore disagree with every timestamp on the screen, which is worse
 * than no clock. UTC sits beside it because it is the reference meteorology
 * actually compares against, and because it is the one figure that means the
 * same thing wherever it is read.
 *
 * HYDRATION
 * The server renders at one instant and the browser at another, so emitting a
 * time during SSR is a guaranteed mismatch — React would discard the markup and
 * warn. Nothing is rendered until the component has mounted; the placeholder
 * holds the same width so the header does not jump when it fills.
 */

/** Formatter per timezone. Building one is expensive; they never change. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string, withSeconds: boolean): Intl.DateTimeFormat {
  const key = `${timeZone}:${withSeconds}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' as const } : {}),
      hour12: false,
    });
    formatters.set(key, f);
  }
  return f;
}

export function StationClock() {
  const { data: org } = useOrg();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    // Ticks on the second. One interval for the whole header, cleared on unmount
    // — a clock that keeps running after navigation is a slow leak.
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // An invalid IANA name would make Intl throw on every tick. The station's
  // timezone comes from the database, so it is worth not trusting blindly.
  const tz = org?.timezone && isValidZone(org.timezone) ? org.timezone : 'UTC';

  if (!now) {
    // Same shape as the filled state, so the header does not reflow on mount.
    return <div className="hidden h-8 w-[13rem] sm:block" aria-hidden />;
  }

  const localTime = formatterFor(tz, true).format(now);
  const utcTime = formatterFor('UTC', false).format(now);
  const local = zoneLabel(tz, now) ?? tz;
  const isUtc = tz === 'UTC' || local === 'UTC';

  return (
    <div
      className="hidden text-right leading-tight sm:block"
      // The whole clock is one live region, announced as a unit rather than
      // letting a screen reader read out every tick.
      role="group"
      aria-label={`Station time ${localTime} ${local}, ${utcTime} UTC`}
    >
      <div className="font-mono text-sm tabular-nums" suppressHydrationWarning>
        {localTime}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{local}</span>
      </div>
      {/* Redundant when the station already runs on UTC — showing the same
          number twice would invite the reader to look for a difference. */}
      {isUtc ? null : (
        <div className="font-mono text-xs tabular-nums text-muted-foreground" suppressHydrationWarning>
          {utcTime} UTC
        </div>
      )}
    </div>
  );
}

function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
