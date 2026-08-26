import { createColumnIndex, type ColumnSpec } from '../src/ingest/registry/column-spec';
import { specForHeader, STORED_FIELDS, MET_ALIASES } from '../src/ingest/met-csv/columns';

/**
 * Declarative column specs (M22 W2).
 *
 * The deliverable is that a new sensor is an ENTRY IN AN ARRAY, not a change to
 * a parser. These tests assert that literally: a spec is declared inline, and
 * the resulting index behaves — no parser is written.
 */

describe('createColumnIndex', () => {
  const columns: ColumnSpec<'__timestamp' | 'turbidityNtu' | 'phValue'>[] = [
    { field: '__timestamp', aliases: ['timestamp', 'time'], numeric: false },
    { field: 'turbidityNtu', aliases: ['turbidity', 'turbidity_ntu', 'ntu'], numeric: true },
    { field: 'phValue', aliases: ['ph', 'ph_value'], numeric: true },
  ];

  it('ONBOARDS A NEW SENSOR SET with no parser code at all', () => {
    // This is the whole point of M22: a format is described as data.
    const index = createColumnIndex(columns);
    expect(index.specForHeader('turbidity')!.field).toBe('turbidityNtu');
    expect(index.specForHeader('ntu')!.field).toBe('turbidityNtu');
    expect(index.specForHeader('ph')!.field).toBe('phValue');
  });

  it('matches case-insensitively and ignores surrounding space', () => {
    const index = createColumnIndex(columns);
    expect(index.specForHeader('  Turbidity_NTU ')!.field).toBe('turbidityNtu');
  });

  it('matches EXACTLY, never as a substring', () => {
    // `direction` is a prefix of `direction_deg`, and a substring match made the
    // shorter alias swallow the longer column in a real file.
    const index = createColumnIndex(columns);
    expect(index.specForHeader('turbidity_raw')).toBeNull();
    expect(index.specForHeader('turb')).toBeNull();
  });

  it('returns null for an unknown header rather than guessing', () => {
    expect(createColumnIndex(columns).specForHeader('salinity')).toBeNull();
  });

  it('THROWS on a colliding alias, at load time not parse time', () => {
    // Discovering this while reading a customer's file would mean attributing
    // their readings to the wrong field.
    expect(() =>
      createColumnIndex([
        { field: 'a', aliases: ['temp'], numeric: true },
        { field: 'b', aliases: ['temp'], numeric: true },
      ]),
    ).toThrow(/claimed by both/i);
  });

  it('allows the same alias listed twice for the SAME field', () => {
    // Two rows feeding one field is legitimate — that is how `fixedUnit`
    // variants of a column are expressed.
    expect(() =>
      createColumnIndex([
        { field: '__speed', aliases: ['speed'], numeric: true },
        { field: '__speed', aliases: ['speed_ms'], numeric: true, fixedUnit: 'ms' },
      ]),
    ).not.toThrow();
  });

  it('rejects an empty alias, which would match an empty header cell', () => {
    expect(() => createColumnIndex([{ field: 'a', aliases: ['  '], numeric: true }])).toThrow(/empty alias/i);
  });

  it('reports stored fields, hiding the internal `__` ones', () => {
    const index = createColumnIndex(columns);
    expect(index.storedFields).toContain('turbidityNtu');
    expect(index.storedFields).not.toContain('__timestamp');
  });

  it('gives each stream its OWN index — no shared global', () => {
    // One stream's `temperature` must not silently claim another's.
    const water = createColumnIndex(columns);
    const air = createColumnIndex([{ field: 'pm25', aliases: ['ph'], numeric: true }]);

    expect(water.specForHeader('ph')!.field).toBe('phValue');
    expect(air.specForHeader('ph')!.field).toBe('pm25');
    expect(air.specForHeader('turbidity')).toBeNull();
  });
});

describe('the MET stream still behaves after moving onto the shared factory', () => {
  it('resolves the aliases that matter, exactly', () => {
    expect(specForHeader('direction')!.field).toBe('windDirRelDeg');
    expect(specForHeader('direction_deg')!.field).toBe('windDirRelDeg');
    expect(specForHeader('timestamp')!.field).toBe('__timestamp');
    expect(specForHeader('units')!.field).toBe('__units');
  });

  it('matches header cells exactly, never by prefix', () => {
    // `direction` and `direction_deg` are deliberately aliases of the SAME
    // field. What must not happen is a PREFIX match: a substring rule made the
    // shorter alias claim any header starting with it, so a real file's
    // `direction_deg` was read through the wrong spec.
    expect(specForHeader('directionx')).toBeNull();
    expect(specForHeader('direction_degrees')).toBeNull();
    expect(specForHeader('wind_direction')).toBeNull();
    // ...while both real spellings still resolve.
    expect(specForHeader('direction')!.field).toBe('windDirRelDeg');
    expect(specForHeader('direction_deg')!.field).toBe('windDirRelDeg');
  });

  it('carries fixedUnit through for the unit-in-name columns', () => {
    // Our own MET export writes these; without them an export cannot be reimported.
    expect(specForHeader('windspeed_ms')!.fixedUnit).toBe('ms');
    expect(specForHeader('speed_kmh')!.fixedUnit).toBe('kmh');
    expect(specForHeader('speed')!.fixedUnit).toBeUndefined();
  });

  it('exposes stored fields without the internals', () => {
    expect(STORED_FIELDS).toContain('windDirRelDeg');
    expect(STORED_FIELDS).toContain('tempC');
    expect(STORED_FIELDS.some((f) => f.startsWith('__'))).toBe(false);
  });

  it('publishes its alias list for the preview screen', () => {
    expect(MET_ALIASES).toContain('direction_deg');
    expect(MET_ALIASES).toContain('timestamp');
  });
});
