import { describe, it, expect } from 'vitest';
import { zonedInputToMs, msToZonedInput } from '@/features/query/zoned-time';

/**
 * The query screen's From/To are the STATION's wall-clock time, whatever zone the
 * viewer's PC is in — so a range means the same hours for everyone.
 */
describe('zoned time for the query range', () => {
  it('reads 09:00 as 09:00 at the station, not in the browser', () => {
    expect(new Date(zonedInputToMs('2026-09-01T09:00', 'Australia/Melbourne')!).toISOString()).toBe('2026-08-31T23:00:00.000Z');
    expect(new Date(zonedInputToMs('2026-09-01T09:00', 'UTC')!).toISOString()).toBe('2026-09-01T09:00:00.000Z');
  });

  it('uses the right offset either side of a daylight-saving change', () => {
    // Sydney: +10 until 02:00 on 4 Oct 2026, +11 after.
    expect(new Date(zonedInputToMs('2026-10-04T01:00', 'Australia/Sydney')!).toISOString()).toBe('2026-10-03T15:00:00.000Z');
    expect(new Date(zonedInputToMs('2026-10-04T09:00', 'Australia/Sydney')!).toISOString()).toBe('2026-10-03T22:00:00.000Z');
  });

  it('round-trips through the input format', () => {
    const ms = Date.parse('2026-09-22T03:07:00Z');
    expect(msToZonedInput(ms, 'Australia/Melbourne')).toBe('2026-09-22T13:07');
    expect(zonedInputToMs(msToZonedInput(ms, 'Australia/Melbourne'), 'Australia/Melbourne')).toBe(ms);
  });

  it('refuses a value it cannot read', () => {
    expect(zonedInputToMs('', 'UTC')).toBeNull();
    expect(zonedInputToMs('22/09/2026 09:00', 'UTC')).toBeNull();
  });
});
