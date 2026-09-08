import { readFileSync } from 'fs';
import { join } from 'path';
import { parseEnvironmentalCsv } from '../src/ingest/environmental-csv/parse-environmental-csv';
import { parseMetCsv } from '../src/ingest/met-csv/parse-met-csv';
import { dewPointC } from '../src/ingest/environmental-csv/dew-point';
import { ENV_ALIASES } from '../src/ingest/environmental-csv/columns';

/**
 * The environmental stream, against a file pulled from the live station.
 *
 * A fixture from the real box rather than one written to match the parser: the
 * whole class of bug this guards against is a header we assumed rather than
 * checked.
 */
const REAL = readFileSync(join(__dirname, 'fixtures/environmental-real.csv'), 'utf8');

describe('environmental CSV parser', () => {
  it('parses the real station file', () => {
    const out = parseEnvironmentalCsv(REAL);
    expect(out.ok).toBe(true);
    expect(out.rejectReason).toBeNull();
    expect(out.header).toEqual(['timestamp', 'temperature_C', 'humidity_percent', 'pressure_hPa']);
  });

  it('emits ONE row for the whole minute, not one per sample', () => {
    const out = parseEnvironmentalCsv(REAL);
    // The file carries ~48 samples of a single minute; storing them all would
    // cost 48× for less variation than the sensor can resolve.
    expect(out.stats.dataLines).toBeGreaterThan(30);
    expect(out.rows).toHaveLength(1);
  });

  it('lands HUMIDITY — the alias the MET spec is missing', () => {
    // `humidity_percent` is absent from the MET column spec, and aliases match on
    // exact equality. Parsed as MET, temperature and pressure arrive and humidity
    // vanishes with no warning — a whole sensor lost silently.
    const met = parseMetCsv(REAL);
    expect(met.rows[0].tempC).not.toBeNull();
    expect(met.rows[0].pressureHpa).not.toBeNull();
    expect(met.rows[0].humidityPct).toBeNull(); // the defect, pinned

    const env = parseEnvironmentalCsv(REAL);
    expect(env.rows[0].humidityPct).not.toBeNull();
    expect(ENV_ALIASES).toContain('humidity_percent');
  });

  it('averages the minute rather than taking one sample', () => {
    const csv =
      'timestamp,temperature_C,humidity_percent,pressure_hPa\r\n' +
      '2026-09-08T19:00:00+10:00,10.00,70.00,1000.00\r\n' +
      '2026-09-08T19:00:01+10:00,12.00,72.00,1002.00\r\n';
    const out = parseEnvironmentalCsv(csv);
    expect(out.rows[0].tempC).toBe(11);
    expect(out.rows[0].humidityPct).toBe(71);
    expect(out.rows[0].pressureHpa).toBe(1001);
  });

  it('stamps the row at the START of the minute it summarises', () => {
    const out = parseEnvironmentalCsv(REAL);
    expect(out.rows[0].timestampMs).toBe(out.stats.firstTsMs);
  });

  it('reports only the sensors the minute actually carried', () => {
    const out = parseEnvironmentalCsv(REAL);
    // These feed Device.availableSensors, which is what makes the portal reveal
    // temperature/humidity/pressure without any further wiring.
    expect(out.sensorsSeen.sort()).toEqual(['dew_point', 'humidity', 'pressure', 'temperature']);
  });

  it('carries no wind, and no speed unit', () => {
    const out = parseEnvironmentalCsv(REAL);
    expect(out.rows[0].windSpeedMs).toBeNull();
    expect(out.rows[0].windDirRelDeg).toBeNull();
    expect(out.unitCode).toBeNull();
  });

  it('keeps a real line for provenance', () => {
    const out = parseEnvironmentalCsv(REAL);
    expect(REAL).toContain(out.rows[0].raw);
  });

  it('refuses a file with no timestamp column', () => {
    const out = parseEnvironmentalCsv('temperature_C,humidity_percent\r\n10,70\r\n');
    expect(out.ok).toBe(false);
    expect(out.rejectReason).toBe('NO_TIMESTAMP_COLUMN');
    expect(out.rows).toHaveLength(0);
  });

  it('names the columns it ignored rather than dropping them silently', () => {
    const out = parseEnvironmentalCsv(
      'timestamp,temperature_C,salinity_ppt\r\n2026-09-08T19:00:00+10:00,10,35\r\n',
    );
    expect(out.warnings.some((w) => w.code === 'UNKNOWN_COLUMN' && w.detail.includes('salinity_ppt'))).toBe(true);
  });

  it('drops a truncated final row unless the file is known complete', () => {
    const whole = 'timestamp,temperature_C\r\n2026-09-08T19:00:00+10:00,10.00\r\n';
    const cut = whole + '2026-09-08T19:00:01+10:00,99.0'; // no terminator
    // The station's uploader cuts mid-write, so the partial row must not count.
    expect(parseEnvironmentalCsv(cut).rows[0].tempC).toBe(10);
    // An admin upload has no such risk.
    expect(parseEnvironmentalCsv(cut, { assumeComplete: true }).rows[0].tempC).toBe(54.5);
  });

  it('rejects a timestamp outside the sanity band', () => {
    const out = parseEnvironmentalCsv('timestamp,temperature_C\r\n20260908,10.00\r\n');
    expect(out.ok).toBe(false);
    expect(out.rejectReason).toBe('NO_VALID_ROWS');
  });
});

describe('dew point', () => {
  it('matches published values', () => {
    // 20 °C at 50 % RH is ~9.3 °C; 25 °C at 60 % is ~16.7 °C.
    expect(dewPointC(20, 50)).toBeCloseTo(9.3, 1);
    expect(dewPointC(25, 60)).toBeCloseTo(16.7, 1);
    // Saturated air: dew point equals the temperature.
    expect(dewPointC(15, 100)).toBeCloseTo(15, 1);
  });

  it('is always at or below the air temperature', () => {
    for (const t of [-10, 0, 11.14, 25, 40]) {
      for (const h of [1, 25, 71.19, 99, 100]) {
        expect(dewPointC(t, h)!).toBeLessThanOrEqual(t + 0.01);
      }
    }
  });

  it('returns null rather than a number for impossible input', () => {
    // 0 % would diverge; outside 0–100 is a faulty sensor, and a derived value
    // from a faulty reading is worse than none.
    expect(dewPointC(20, 0)).toBeNull();
    expect(dewPointC(20, 101)).toBeNull();
    expect(dewPointC(null, 50)).toBeNull();
    expect(dewPointC(20, null)).toBeNull();
    expect(dewPointC(999, 50)).toBeNull();
  });
});
