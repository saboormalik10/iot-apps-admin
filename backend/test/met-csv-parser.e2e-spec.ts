import { readFileSync } from 'fs';
import { join } from 'path';

import { parseMetCsv, splitCsvLine } from '../src/ingest/met-csv/parse-met-csv';
import { resolveSpeedUnit, toMetresPerSecond } from '../src/ingest/met-csv/units';
import { specForHeader } from '../src/ingest/met-csv/columns';

/**
 * Pure unit tests for the weather-station CSV parser (M13 W2).
 *
 * Named `.e2e-spec.ts` only so it runs under the single shared jest config in
 * test/jest-e2e.json — it touches no app, no network and no database. Same
 * convention as import-timestamp.e2e-spec.ts.
 *
 * The fixtures in test/fixtures/wx/ are REAL files copied byte-for-byte off the
 * production Lightsail box, CRLF intact. They are the point of this suite: the
 * behaviours below are the ones that were actually observed in 74,636 rows, not
 * ones imagined at a desk.
 */

const fixture = (name: string): string => readFileSync(join(__dirname, 'fixtures', 'wx', name), 'utf8');

describe('splitCsvLine', () => {
  it('splits a plain row and trims cells', () => {
    expect(splitCsvLine('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps a comma that lives inside quotes', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });

  it('unescapes a doubled quote', () => {
    expect(splitCsvLine('a,"say ""hi""",c')).toEqual(['a', 'say "hi"', 'c']);
  });

  it('preserves empty cells rather than collapsing them', () => {
    expect(splitCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('units', () => {
  it('reads K as km/h, not knots', () => {
    expect(resolveSpeedUnit('K')).toBe('kmh');
    // 1.80 K from the real corpus is 0.5 m/s. As knots it would be 0.926 — a
    // factor of ~1.85 wrong on every single reading.
    expect(toMetresPerSecond(1.8, 'kmh')).toBeCloseTo(0.5, 3);
  });

  it('handles the other three NMEA codes', () => {
    expect(resolveSpeedUnit('M')).toBe('ms');
    expect(resolveSpeedUnit('N')).toBe('kn');
    expect(resolveSpeedUnit('P')).toBe('mph');
  });

  it('is case-insensitive and tolerates padding', () => {
    expect(resolveSpeedUnit(' k ')).toBe('kmh');
  });

  it('returns null for an unknown code instead of guessing', () => {
    expect(resolveSpeedUnit('Z')).toBeNull();
    expect(resolveSpeedUnit('')).toBeNull();
    expect(resolveSpeedUnit(undefined)).toBeNull();
  });
});

describe('column registry', () => {
  it('matches both header variants seen in the wild', () => {
    expect(specForHeader('direction')?.field).toBe('windDirRelDeg');
    expect(specForHeader('direction_deg')?.field).toBe('windDirRelDeg');
  });

  it('matches exactly, so `direction` does not swallow `direction_deg`', () => {
    // A substring or prefix match would bind whichever spec came first in the
    // registry, silently and order-dependently.
    expect(specForHeader('direction_deg')?.field).toBe(specForHeader('direction')?.field);
    expect(specForHeader('directional')).toBeNull();
    expect(specForHeader('wind direction')).toBeNull();
  });

  it('is case- and whitespace-insensitive', () => {
    expect(specForHeader('  TimeStamp ')?.field).toBe('__timestamp');
  });

  it('returns null for an unknown column rather than throwing', () => {
    expect(specForHeader('nonsense')).toBeNull();
  });
});

describe('parseMetCsv — real WindSonic file', () => {
  const result = parseMetCsv(fixture('windsonic-full.csv'));

  it('parses every data row', () => {
    expect(result.ok).toBe(true);
    expect(result.rejectReason).toBeNull();
    expect(result.rows).toHaveLength(51); // 52 lines - 1 header
    expect(result.stats.skipped).toBe(0);
  });

  it('converts km/h to m/s', () => {
    const first = result.rows[0];
    expect(first.windSpeedKmh).toBeCloseTo(1.8, 2);
    expect(first.windSpeedMs).toBeCloseTo(0.5, 2);
  });

  it('reads the +10:00 offset as real UTC, not local wall-clock', () => {
    // 2026-08-18T11:21:00+10:00 === 2026-08-18T01:21:00Z
    expect(new Date(result.rows[0].timestampMs).toISOString()).toBe('2026-08-18T01:21:00.000Z');
  });

  it('maps direction to the RELATIVE field, since the source sentence says R', () => {
    expect(result.rows[0].windDirRelDeg).toBe(291);
  });

  it('keeps the raw line for provenance', () => {
    expect(result.rows[0].raw).toContain('291');
    expect(result.rows[0].raw).not.toContain('\r');
  });

  it('reports the modal unit code and the sensors present', () => {
    expect(result.unitCode).toBe('K');
    expect(result.sensorsSeen).toEqual(expect.arrayContaining(['wind_speed', 'wind_dir']));
    // The station sends wind only — nothing else may be claimed.
    expect(result.sensorsSeen).not.toContain('temperature');
    expect(result.sensorsSeen).not.toContain('pressure');
  });

  it('leaves absent sensors null rather than zero', () => {
    expect(result.rows[0].tempC).toBeNull();
    expect(result.rows[0].humidityPct).toBeNull();
    expect(result.rows[0].pressureHpa).toBeNull();
  });

  it('does NOT deduplicate genuinely repeated timestamps', () => {
    // 11:21:06 appears twice in this real file with different speeds. Both are
    // real readings; the sensor samples faster than the 1s timestamp resolution.
    const seconds = result.rows.map((r) => r.timestampMs);
    expect(new Set(seconds).size).toBeLessThan(seconds.length);
  });
});

describe('parseMetCsv — legacy wind_ header', () => {
  const result = parseMetCsv(fixture('wind-legacy-header.csv'));

  it('parses the direction_deg variant identically', () => {
    expect(result.ok).toBe(true);
    expect(result.header).toContain('direction_deg');
    expect(result.rows[0].windDirRelDeg).toBe(291);
    expect(result.rows[0].windSpeedKmh).toBeCloseTo(1.72, 2);
  });

  it('raises no unknown-column warnings for it', () => {
    expect(result.warnings.filter((w) => w.code === 'UNKNOWN_COLUMN')).toHaveLength(0);
  });
});

describe('parseMetCsv — calm conditions', () => {
  const result = parseMetCsv(fixture('windsonic-calm-null-dir.csv'));

  it('parses an empty direction cell as null, never 0', () => {
    // `,,0.10,K,A` — below 0.16 km/h the sensor cannot resolve a bearing.
    // Zero would read as due north and put a large false spike on the wind rose.
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.windDirRelDeg).toBeNull();
    }
  });

  it('still records the speed for those rows', () => {
    expect(result.rows[0].windSpeedKmh).toBeCloseTo(0.1, 2);
    expect(result.rows[0].windSpeedMs).not.toBeNull();
  });

  it('does not claim wind_dir as an available sensor when every value is null', () => {
    expect(result.sensorsSeen).toContain('wind_speed');
    expect(result.sensorsSeen).not.toContain('wind_dir');
  });
});

describe('parseMetCsv — truncated upload', () => {
  it('parses the short real file the uploader produced', () => {
    const result = parseMetCsv(fixture('windsonic-truncated.csv'));
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
  });

  it('drops a trailing partial row and flags the truncation', () => {
    const cut = 'timestamp,direction,speed,units,status\r\n2026-08-20T04:09:00+10:00,291,1.80,K,A\r\n2026-08-20T04:09:01+10:00,28';
    const result = parseMetCsv(cut);
    expect(result.rows).toHaveLength(1);
    expect(result.stats.truncatedTail).toBe(true);
  });

  it('marks a clean file as not truncated', () => {
    expect(parseMetCsv(fixture('windsonic-full.csv')).stats.truncatedTail).toBe(false);
  });

  it('skips a short row rather than zero-filling it', () => {
    const short = 'timestamp,direction,speed,units,status\r\n2026-08-20T04:09:00+10:00,291\r\n';
    const result = parseMetCsv(short);
    expect(result.rejectReason).toBe('NO_VALID_ROWS');
    expect(result.warnings.some((w) => w.code === 'COLUMN_COUNT_MISMATCH')).toBe(true);
  });
});

describe('parseMetCsv — timestamp sanity band', () => {
  const wrap = (ts: string) => `timestamp,direction,speed,units,status\r\n${ts},291,1.80,K,A\r\n`;

  it('rejects a bare date that would otherwise land in 1970', () => {
    // parseImportTimestampMs('20260820') is all-digits, so it returns 20260820 ms.
    const result = parseMetCsv(wrap('20260820'));
    expect(result.rejectReason).toBe('NO_VALID_ROWS');
    expect(result.warnings.some((w) => w.code === 'TIMESTAMP_OUT_OF_RANGE')).toBe(true);
  });

  it('rejects a far-future timestamp from a dead station clock', () => {
    const result = parseMetCsv(wrap('2035-01-01T00:00:00+10:00'));
    expect(result.rejectReason).toBe('NO_VALID_ROWS');
    expect(result.warnings.some((w) => w.code === 'TIMESTAMP_OUT_OF_RANGE')).toBe(true);
  });

  it('rejects an unparseable timestamp', () => {
    const result = parseMetCsv(wrap('not-a-date'));
    expect(result.warnings.some((w) => w.code === 'BAD_TIMESTAMP')).toBe(true);
  });

  it('accepts a normal recent reading', () => {
    const ts = new Date(Date.now() - 60_000).toISOString();
    expect(parseMetCsv(wrap(ts)).ok).toBe(true);
  });
});

describe('parseMetCsv — rejections', () => {
  it('rejects an empty file', () => {
    expect(parseMetCsv('').rejectReason).toBe('EMPTY_FILE');
    expect(parseMetCsv('   \r\n').rejectReason).toBe('EMPTY_FILE');
  });

  it('rejects a file with no timestamp column', () => {
    const r = parseMetCsv('direction,speed,units,status\r\n291,1.80,K,A\r\n');
    expect(r.rejectReason).toBe('NO_TIMESTAMP_COLUMN');
  });

  it('never throws, whatever it is handed', () => {
    for (const junk of ['\0\0\0', 'a', ',,,,,', '"unterminated', '\r\n\r\n']) {
      expect(() => parseMetCsv(junk)).not.toThrow();
    }
  });

  it('warns about an unknown column but still parses the known ones', () => {
    const r = parseMetCsv('timestamp,direction,speed,units,status,mystery\r\n2026-08-20T04:09:00+10:00,291,1.80,K,A,42\r\n');
    expect(r.ok).toBe(true);
    expect(r.rows[0].windDirRelDeg).toBe(291);
    expect(r.warnings.some((w) => w.code === 'UNKNOWN_COLUMN')).toBe(true);
  });

  it('drops the speed rather than guessing when the unit code is unknown', () => {
    const r = parseMetCsv('timestamp,direction,speed,units,status\r\n2026-08-20T04:09:00+10:00,291,1.80,Z,A\r\n');
    expect(r.rows[0].windSpeedMs).toBeNull();
    expect(r.warnings.some((w) => w.code === 'UNKNOWN_UNIT_CODE')).toBe(true);
  });
});

describe('parseMetCsv — assumeComplete', () => {
  // Two data rows, no trailing newline — so one survives either way and the
  // difference is visible rather than collapsing into a rejected file.
  const noTrailingNewline =
    'timestamp,direction,speed,units,status\r\n' +
    '2026-08-20T04:09:00+10:00,291,1.80,K,A\r\n' +
    '2026-08-20T04:09:01+10:00,292,1.90,K,A';

  it('drops the last line by default — the SFTP uploader cuts files mid-write', () => {
    const r = parseMetCsv(noTrailingNewline);
    expect(r.rows).toHaveLength(1);
    expect(r.stats.truncatedTail).toBe(true);
  });

  it('keeps it when the caller knows the file is complete', () => {
    // An admin upload is a whole file the user chose; plenty of writers simply
    // do not end with a newline. Treating that as truncation silently discarded
    // the last row of every import.
    const r = parseMetCsv(noTrailingNewline, { assumeComplete: true });
    expect(r.rows).toHaveLength(2);
    expect(r.stats.truncatedTail).toBe(false);
  });
});

describe('parseMetCsv — our own MET export round-trips', () => {
  const HEADER =
    'Timestamp,Temp_C,Humidity_%,Pressure_hPa,WindSpeed_ms,WindSpeed_kmh,WindDir_deg,DewPoint_C,Precip_mm,Solar_Wm2,Voltage_V,Lat,Lng';
  const csv = `${HEADER}\n1787000000000,20,55,1013,3.2,11.5,180,10.2,0,500,12.1,51.5,-0.12`;

  it('maps every column the exporter writes', () => {
    const r = parseMetCsv(csv, { assumeComplete: true });
    expect(r.warnings.filter((w) => w.code === 'UNKNOWN_COLUMN')).toHaveLength(0);
  });

  it('reads a unit baked into the column name', () => {
    // These columns carry their unit in the header and have no `units` column.
    const r = parseMetCsv(csv, { assumeComplete: true });
    expect(r.rows[0].windSpeedMs).toBe(3.2);
  });

  it('prefers the m/s column when both are present', () => {
    // Otherwise whichever appeared last in the header silently won.
    const r = parseMetCsv('Timestamp,WindSpeed_kmh,WindSpeed_ms\n1787000000000,11.5,3.2', { assumeComplete: true });
    expect(r.rows[0].windSpeedMs).toBe(3.2);
  });

  it('still converts a km/h-only column', () => {
    const r = parseMetCsv('Timestamp,WindSpeed_kmh\n1787000000000,18', { assumeComplete: true });
    expect(r.rows[0].windSpeedMs).toBe(5);
  });
});

describe('parseMetCsv — forward compatibility', () => {
  it('picks up temperature, humidity and pressure with no code change', () => {
    // This is the header the fuller weather station is expected to send. The
    // registry already knows these aliases, so nothing needs editing.
    const csv =
      'timestamp,direction,speed,units,status,temperature,humidity,pressure\r\n' +
      '2026-08-20T04:09:00+10:00,291,1.80,K,A,18.4,63,1013.2\r\n';
    const r = parseMetCsv(csv);

    expect(r.ok).toBe(true);
    expect(r.rows[0].tempC).toBe(18.4);
    expect(r.rows[0].humidityPct).toBe(63);
    expect(r.rows[0].pressureHpa).toBe(1013.2);
    expect(r.sensorsSeen).toEqual(expect.arrayContaining(['temperature', 'humidity', 'pressure']));
    expect(r.warnings.filter((w) => w.code === 'UNKNOWN_COLUMN')).toHaveLength(0);
  });
});

describe('parseMetCsv — scale', () => {
  it('handles a full day at 1 Hz without a stack overflow', () => {
    // Guards the `Math.min(...arr)` failure mode: the spread form throws
    // RangeError past ~100k arguments, and a day at 1 Hz is 86,400 rows.
    const base = Date.UTC(2026, 7, 20, 0, 0, 0);
    const lines = ['timestamp,direction,speed,units,status'];
    for (let i = 0; i < 86_400; i++) {
      lines.push(`${new Date(base + i * 1000).toISOString()},291,1.80,K,A`);
    }
    const r = parseMetCsv(lines.join('\r\n') + '\r\n');

    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(86_400);
    expect(r.stats.firstTsMs).toBe(base);
    expect(r.stats.lastTsMs).toBe(base + 86_399_000);
  });

  it('caps warnings so a pathological file cannot exhaust memory', () => {
    const lines = ['timestamp,direction,speed,units,status'];
    for (let i = 0; i < 500; i++) lines.push('garbage,291,1.80,K,A');
    const r = parseMetCsv(lines.join('\r\n') + '\r\n');
    expect(r.warnings.length).toBeLessThanOrEqual(50);
  });
});
