import { canonicalTimeZone, isValidTimeZone } from '../src/common/validators/is-time-zone.validator';
import { localDayKey } from '../src/utils/tz.util';

/**
 * A customer's timezone decides where their DAYS are cut, and that boundary is
 * written into every record at ingest. An unknown zone does not fail there — it
 * falls back to `UTC` — so a typo silently shifts a customer's days and only
 * looks wrong much later, by which point the records carry the wrong boundary.
 *
 * The field is a dropdown now, but the API still has to refuse a bad value:
 * the UI is not the only caller.
 */
describe('timezone validation', () => {
  it('accepts real IANA zones', () => {
    for (const tz of ['UTC', 'Australia/Sydney', 'Asia/Karachi', 'America/New_York', 'Europe/London']) {
      expect(isValidTimeZone(tz)).toBe(true);
    }
  });

  it('rejects the near-misses a human actually types', () => {
    // Abbreviations and bare city names are NOT zone identifiers, however
    // natural they look in a free-text box.
    for (const tz of ['Australia/Sydny', 'AEST', 'GMT+10', 'Sydney', '+10:00', '', '   ']) {
      expect(isValidTimeZone(tz)).toBe(false);
    }
  });

  it('accepts a differently-cased zone, and stores one spelling for it', () => {
    // `Intl` matches case-insensitively, so this IS a real zone — rejecting it
    // would refuse something legitimate. It is normalised instead, or the
    // database ends up holding several spellings of one zone that no longer
    // compare equal.
    expect(isValidTimeZone('australia/sydney ')).toBe(true);
    expect(canonicalTimeZone('australia/sydney ')).toBe('Australia/Sydney');
    expect(canonicalTimeZone('AUSTRALIA/SYDNEY')).toBe('Australia/Sydney');
    expect(canonicalTimeZone('utc')).toBe('UTC');
    expect(canonicalTimeZone('Australia/Sydny')).toBeNull();
  });

  it('rejects non-strings rather than throwing', () => {
    for (const v of [null, undefined, 42, {}]) {
      expect(isValidTimeZone(v as unknown as string)).toBe(false);
    }
  });

  /**
   * Why it matters, stated as data: the same instant belongs to a different day
   * depending on the zone. Accepting a typo means accepting the wrong answer
   * here, permanently.
   */
  it('proves the zone changes which day a reading belongs to', () => {
    // 8 Sep 2026, 16:00 UTC — already the 9th in Sydney, still the 8th elsewhere.
    const at = Date.UTC(2026, 8, 8, 16, 0, 0);
    expect(localDayKey(at, 'Australia/Sydney')).toBe('2026-09-09');
    expect(localDayKey(at, 'Asia/Karachi')).toBe('2026-09-08');
    expect(localDayKey(at, 'UTC')).toBe('2026-09-08');
    expect(localDayKey(at, 'America/New_York')).toBe('2026-09-08');
  });
});
