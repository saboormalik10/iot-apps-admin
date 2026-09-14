import { describe, it, expect } from 'vitest';
import { describeQc, describeQcCode } from '@/features/records/describe-qc';

/**
 * QC codes are stored as `check:field` so they stay machine-readable. This is
 * the only place that turns them into English, so an operator reading the table
 * never has to look one up.
 */
describe('describeQcCode', () => {
  it('names the raw sensor status code, which is what the manual is indexed by', () => {
    expect(describeQcCode('status:V')).toContain('"V"');
  });

  it('uses the operator’s word for the field, not the database column', () => {
    expect(describeQcCode('range:humidityPct')).toBe('Humidity was outside the range that is physically possible');
    expect(describeQcCode('step:tempC')).toContain('Temperature');
    expect(describeQcCode('persist:pressureHpa')).toContain('Pressure');
  });

  it('explains the cross-field check in plain terms', () => {
    expect(describeQcCode('consistency:dewPointC>tempC')).toBe('Dew point was above air temperature, which cannot happen');
  });

  it('falls back to the raw code rather than inventing a meaning', () => {
    // A code added to the backend before this map catches up must still show
    // SOMETHING an engineer can search for.
    expect(describeQcCode('newcheck:tempC')).toBe('newcheck:tempC');
  });
});

describe('describeQc', () => {
  it('is null for a clean reading, so the column stays empty', () => {
    expect(describeQc(undefined)).toBeNull();
    expect(describeQc([])).toBeNull();
  });

  it('joins every reason for the row', () => {
    const out = describeQc(['range:tempC', 'status:V'])!;
    expect(out).toContain('Temperature');
    expect(out).toContain('"V"');
  });
});
