'use client';

import { useOrg } from '@/features/org/use-org';

/**
 * The station's time zone — the one every reading is stamped in.
 *
 * People open this portal from PCs around the site (and sometimes elsewhere), so
 * the browser's own zone is nobody's answer: the Records list showed 11:46 while
 * the header clock beside it showed 16:46 for the same reading. Every absolute
 * time in the portal is shown in this zone and labelled with it.
 */
export function useSiteTimeZone(): string {
  const { data: org } = useOrg();
  const tz = org?.timezone;
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** "AEST" / "GMT+10" for the tz right now — a short label for a column header. */
export function zoneLabel(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
  } catch {
    return tz;
  }
}
