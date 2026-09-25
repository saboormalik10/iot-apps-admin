/**
 * Short name for a timezone — "AEST", "GMT+10" — resolved at a given instant.
 *
 * At an instant, not in the abstract, because the abbreviation changes with
 * daylight saving: the same station is AEST for half the year and AEDT for the
 * other half. Labelling a winter reading "AEDT" would be wrong by an hour, which
 * is exactly the kind of error a timezone label exists to prevent.
 */
export function zoneLabel(timeZone: string | undefined, at: number | Date = Date.now()): string | null {
  if (!timeZone) return null;
  try {
    // The VIEWER's locale, not a hardcoded one. CLDR only uses "AEST" where that
    // abbreviation is idiomatic (en-AU); en-GB and en-US resolve the same zone to
    // "GMT+10". Both are correct and unambiguous, and forcing one locale would
    // show an Australian abbreviation to a reader whose locale never uses it.
    const parts = new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: 'short' }).formatToParts(
      at instanceof Date ? at : new Date(at),
    );
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    // An invalid IANA name from the database must not throw on every render.
    return null;
  }
}
