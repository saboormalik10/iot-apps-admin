import { parseImportTimestampMs } from '../../import/parse-import-timestamp';
import { COLUMNS, ColumnSpec, FIELD_TO_SENSOR_KEY, specForHeader, CanonicalField } from './columns';
import { msToKmh, msToKnots, resolveSpeedUnit, toMetresPerSecond } from './units';

/**
 * Parser for the weather-station CSV that arrives over SFTP.
 *
 * Pure: no Nest, no database, no I/O. Every behaviour below was verified against
 * 2,434 real files (74,636 rows) pulled from the live server.
 *
 * DESIGN NOTES THAT ARE EASY TO GET WRONG
 *
 * - It returns a result object and never throws. The ingest endpoint reports a
 *   disposition per file, so a bad file must not abort its 59 healthy siblings.
 *
 * - It does NOT deduplicate. 280 timestamps in the real corpus appear twice with
 *   genuinely different readings — the sensor samples faster than 1 Hz and the
 *   timestamp is truncated to whole seconds. Dropping the second row would
 *   silently discard real data.
 *
 * - An empty direction cell is `null`, never `0`. 31.3% of real rows are calm
 *   (below the sensor's 0.16 km/h bearing threshold) and report no direction.
 *   Zero would read as due north and produce a large false spike on the wind rose.
 *
 * - The final line is kept only if the input ended with a line terminator. The
 *   uploader truncates files mid-write, so a trailing partial row is common.
 *
 * - Direction is RELATIVE to the mast (`R` in the source `$IIMWV` sentence), so it
 *   maps to `windDirRelDeg`. Deriving `windDirTrueDeg` needs the per-device
 *   heading offset and is the caller's job, not the parser's.
 */

/** Rejects a timestamp outside this band — catches a dead RTC or a bare date string. */
const MIN_TS_MS = Date.UTC(2020, 0, 1);
const FUTURE_TOLERANCE_MS = 48 * 60 * 60 * 1000;

const MAX_WARNINGS = 50;

export interface ParsedMetRow {
  timestampMs: number;
  /** The raw CSV line, stored verbatim on MetMeasure.dataSentence for provenance. */
  raw: string;
  windSpeedMs: number | null;
  windSpeedKmh: number | null;
  windSpeedKnots: number | null;
  windDirRelDeg: number | null;
  tempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  dewPointC: number | null;
  solarWm2: number | null;
  precipMm: number | null;
  voltageV: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  /** NMEA validity flag: 'A' = valid, 'V' = void. Anything else is passed through. */
  status: string | null;
}

export interface ParseWarning {
  line: number;
  code:
    | 'UNKNOWN_COLUMN'
    | 'COLUMN_COUNT_MISMATCH'
    | 'BAD_TIMESTAMP'
    | 'TIMESTAMP_OUT_OF_RANGE'
    | 'UNKNOWN_UNIT_CODE'
    | 'NON_NUMERIC';
  detail: string;
}

export interface ParsedMetFile {
  ok: boolean;
  /** Set when the file could not be parsed at all; rows will be empty. */
  rejectReason: 'EMPTY_FILE' | 'NO_HEADER' | 'NO_TIMESTAMP_COLUMN' | 'NO_VALID_ROWS' | null;
  header: string[];
  rows: ParsedMetRow[];
  /** Sensor keys with at least one non-null value — feeds Device.availableSensors. */
  sensorsSeen: string[];
  /** The file-level modal unit code, e.g. 'K'. */
  unitCode: string | null;
  stats: {
    totalLines: number;
    dataLines: number;
    skipped: number;
    /** True when the input did not end with a line terminator. */
    truncatedTail: boolean;
    firstTsMs: number | null;
    lastTsMs: number | null;
  };
  warnings: ParseWarning[];
}

/**
 * Minimal quote-aware CSV line splitter.
 *
 * The existing `splitCsv` in import.service.ts is quote-unaware, so a quoted
 * field containing a comma silently shifts every later column. The station does
 * not quote today, but a third-party stream may.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Numeric cell → number | null.
 * Trims FIRST: `Number('  ')` is 0, which would turn whitespace into a real
 * reading. Empty, whitespace, '---' and non-numeric all yield null.
 */
function num(cell: string | undefined): number | null {
  const s = (cell ?? '').trim();
  if (s === '' || s === '---' || s === 'NaN') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface ParseOptions {
  /**
   * True when the bytes are known to be a COMPLETE file.
   *
   * The trailing-newline check exists because the station's uploader cuts files
   * mid-write, so a missing terminator means a partial row that must be dropped.
   * A file uploaded through the admin panel has no such risk — and plenty of
   * writers simply do not end with a newline. Treating that as truncation silently
   * discarded the last row of every admin import.
   */
  assumeComplete?: boolean;
}

export function parseMetCsv(text: string, opts: ParseOptions = {}): ParsedMetFile {
  const warnings: ParseWarning[] = [];
  const warn = (line: number, code: ParseWarning['code'], detail: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push({ line, code, detail });
  };

  const empty = (reason: ParsedMetFile['rejectReason']): ParsedMetFile => ({
    ok: false,
    rejectReason: reason,
    header: [],
    rows: [],
    sensorsSeen: [],
    unitCode: null,
    stats: { totalLines: 0, dataLines: 0, skipped: 0, truncatedTail: false, firstTsMs: null, lastTsMs: null },
    warnings,
  });

  if (!text || !text.trim()) return empty('EMPTY_FILE');

  // Whether the input ended cleanly must be decided BEFORE blank lines are
  // filtered out, or the evidence of truncation is destroyed.
  const endedCleanly = opts.assumeComplete === true || /\r?\n$/.test(text);

  const allLines = text.split(/\r?\n/);
  if (!endedCleanly && allLines.length > 0) allLines.pop(); // drop the partial row
  const lines = allLines.filter((l) => l.trim() !== '');
  if (lines.length === 0) return empty('EMPTY_FILE');

  // ── Header ────────────────────────────────────────────────────────────────
  const header = splitCsvLine(lines[0]);
  if (header.length === 0) return empty('NO_HEADER');

  const specs: (ColumnSpec | null)[] = header.map((cell, i) => {
    const spec = specForHeader(cell);
    if (!spec) warn(1, 'UNKNOWN_COLUMN', `column ${i} "${cell}" is not in the registry`);
    return spec;
  });

  if (!specs.some((s) => s?.field === '__timestamp')) {
    return empty('NO_TIMESTAMP_COLUMN');
  }

  // ── Rows ──────────────────────────────────────────────────────────────────
  const rows: ParsedMetRow[] = [];
  const unitCounts = new Map<string, number>();
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const cells = splitCsvLine(raw);

    // A short row means the write was cut on a cell boundary. Never zero-fill.
    if (cells.length !== header.length) {
      warn(lineNo, 'COLUMN_COUNT_MISMATCH', `expected ${header.length} cells, got ${cells.length}`);
      skipped++;
      continue;
    }

    const picked = new Map<CanonicalField, string>();
    let speedSpec: ColumnSpec | null = null;
    for (let c = 0; c < specs.length; c++) {
      const spec = specs[c];
      if (!spec) continue;
      if (spec.field === '__speed') {
        // A file can carry BOTH `WindSpeed_ms` and `WindSpeed_kmh` (our own export
        // does). Prefer the m/s column: it is the base unit the whole analytics
        // stack computes in, so taking it avoids a needless conversion. Without an
        // explicit rule the last column in the header won, which is arbitrary.
        const better = !speedSpec || (spec.fixedUnit === 'ms' && speedSpec.fixedUnit !== 'ms');
        if (!better) continue;
        speedSpec = spec;
      }
      picked.set(spec.field, cells[c]);
    }

    const tsMs = parseImportTimestampMs(picked.get('__timestamp'));
    if (!Number.isFinite(tsMs)) {
      warn(lineNo, 'BAD_TIMESTAMP', `unparseable: "${picked.get('__timestamp') ?? ''}"`);
      skipped++;
      continue;
    }
    // `parseImportTimestampMs('20260820')` is all-digits, so it returns 20260820 —
    // January 1970. The band also catches a station with a dead clock, which would
    // otherwise pin "latest reading" to a future date permanently.
    if (tsMs < MIN_TS_MS || tsMs > Date.now() + FUTURE_TOLERANCE_MS) {
      warn(lineNo, 'TIMESTAMP_OUT_OF_RANGE', `${new Date(tsMs).toISOString()} outside [2020, now+48h]`);
      skipped++;
      continue;
    }

    // Speed, with the per-row unit code (falls back to the file's modal code later).
    const unitRaw = (picked.get('__units') ?? '').trim();
    if (unitRaw) unitCounts.set(unitRaw.toUpperCase(), (unitCounts.get(unitRaw.toUpperCase()) ?? 0) + 1);

    const speedRaw = num(picked.get('__speed'));
    // A unit baked into the column name (`WindSpeed_ms`) is authoritative — a
    // file written that way has no separate units column to consult.
    const unit = speedSpec?.fixedUnit ?? resolveSpeedUnit(unitRaw);
    let windSpeedMs: number | null = null;
    if (speedRaw !== null) {
      if (unit) {
        windSpeedMs = toMetresPerSecond(speedRaw, unit);
      } else {
        warn(lineNo, 'UNKNOWN_UNIT_CODE', `"${unitRaw}" is not an NMEA speed unit — speed dropped`);
      }
    }

    const row: ParsedMetRow = {
      timestampMs: tsMs,
      raw,
      windSpeedMs,
      windSpeedKmh: windSpeedMs === null ? null : msToKmh(windSpeedMs),
      windSpeedKnots: windSpeedMs === null ? null : msToKnots(windSpeedMs),
      windDirRelDeg: num(picked.get('windDirRelDeg')),
      tempC: num(picked.get('tempC')),
      humidityPct: num(picked.get('humidityPct')),
      pressureHpa: num(picked.get('pressureHpa')),
      dewPointC: num(picked.get('dewPointC')),
      solarWm2: num(picked.get('solarWm2')),
      precipMm: num(picked.get('precipMm')),
      voltageV: num(picked.get('voltageV')),
      gpsLat: num(picked.get('gpsLat')),
      gpsLng: num(picked.get('gpsLng')),
      status: (picked.get('__status') ?? '').trim() || null,
    };
    rows.push(row);
  }

  if (rows.length === 0) return empty('NO_VALID_ROWS');

  // ── Derived summary ───────────────────────────────────────────────────────
  // Min/max by reduce, never `Math.min(...arr)` — a day at 1 Hz is 86,400 values
  // and the spread form throws RangeError past roughly 100k arguments.
  let firstTsMs = rows[0].timestampMs;
  let lastTsMs = rows[0].timestampMs;
  for (const r of rows) {
    if (r.timestampMs < firstTsMs) firstTsMs = r.timestampMs;
    if (r.timestampMs > lastTsMs) lastTsMs = r.timestampMs;
  }

  const sensorsSeen: string[] = [];
  if (rows.some((r) => r.windSpeedMs !== null)) sensorsSeen.push('wind_speed');
  for (const spec of COLUMNS) {
    const key = FIELD_TO_SENSOR_KEY[spec.field];
    if (!key) continue;
    const f = spec.field as keyof ParsedMetRow;
    if (rows.some((r) => r[f] !== null && r[f] !== undefined)) sensorsSeen.push(key);
  }

  let unitCode: string | null = null;
  let best = 0;
  for (const [code, n] of unitCounts) {
    if (n > best) {
      best = n;
      unitCode = code;
    }
  }

  return {
    ok: true,
    rejectReason: null,
    header,
    rows,
    sensorsSeen,
    unitCode,
    stats: {
      totalLines: lines.length,
      dataLines: rows.length,
      skipped,
      truncatedTail: !endedCleanly,
      firstTsMs,
      lastTsMs,
    },
    warnings,
  };
}
