import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Is this a timezone the runtime actually knows?
 *
 * Asking `Intl` is the same tz database every consumer uses — `localDayKey` when
 * cutting a customer's days at ingest, and the browser when rendering them — so
 * accepting here means the value works everywhere it is later read.
 */
export function isValidTimeZone(value: string): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    // Throws RangeError for anything the tz database does not contain.
    new Intl.DateTimeFormat('en-GB', { timeZone: value.trim() }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * The canonical spelling of a zone, or `null` if it is not a zone at all.
 *
 * `Intl` matches zone names case-insensitively, so `australia/sydney` is a valid
 * input — but storing it that way leaves the database holding several spellings
 * of one zone, which then fail to compare equal. Normalising on the way in keeps
 * one spelling per zone without rejecting anything a user legitimately typed.
 */
export function canonicalTimeZone(value: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: value.trim() }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * Rejects a timezone the platform cannot honour.
 *
 * Without this a typo is accepted and then silently ignored: ingest falls back
 * to `UTC` for an unknown zone, so the customer's days get cut on the wrong
 * boundary — and that boundary is written into every record as it arrives, so it
 * is not something a later correction can undo.
 */
export function IsTimeZone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTimeZone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isValidTimeZone(value as string),
        defaultMessage: () =>
          'timezone must be an IANA zone name, e.g. "Australia/Sydney" or "UTC"',
      },
    });
  };
}
