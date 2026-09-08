import { parseImportTimestampMs } from '../../import/parse-import-timestamp';
import { splitCsvLine, type ParsedMetFile, type ParsedMetRow, type ParseWarning } from '../met-csv/parse-met-csv';
import { type ParseOptions } from '../registry/stream-parser';
import { specForEnvHeader, type EnvField } from './columns';
import { dewPointC } from './dew-point';

/**
 * Parser for the station's environmental stream — temperature, humidity,
 * pressure.
 *
 * Pure: no Nest, no database, no I/O. Returns a result object and never throws,
 * because the ingest endpoint reports a disposition per file and one bad file
 * must not abort its healthy siblings.
 *
 * WHY THIS EMITS ONE ROW PER FILE
 *
 * The station writes one file per minute at 1 Hz, so a file is ~48 samples of
 * the same minute. Those samples barely differ — a real minute reads
 * `11.14, 11.14, 11.14 … 11.12`, a range of 0.02 °C, which is under the sensor's
 * own precision. Storing all 48 costs the same per row as a wind reading
 * (`MetMeasure` persists its nulls, ~567 B billed either way), which is 39 MB a
 * day for information that fits in 0.8 MB.
 *
 * So the minute is averaged into a single row. Charts, alert evaluation and the
 * daily rollup all consume it identically — they aggregate over rows regardless
 * of how many there are. The only thing lost is sub-minute detail that the
 * sensor cannot really resolve.
 *
 * The raw line kept on the row is the FIRST sample of the minute, so the
 * provenance trail still points at real bytes from the file.
 */

/** Rejects a timestamp outside this band — catches a dead RTC or a bare date string. */
const MIN_TS_MS = Date.UTC(2020, 0, 1);
const FUTURE_TOLERANCE_MS = 48 * 60 * 60 * 1000;
const MAX_WARNINGS = 50;

function num(cell: string | undefined): number | null {
  const s = (cell ?? '').trim();
  if (s === '' || s === '---' || s === 'NaN') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Mean of the values present, or null when the minute carried none. */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  // Two decimals matches what the station writes; more would be false precision.
  return Math.round((sum / values.length) * 100) / 100;
}

export function parseEnvironmentalCsv(text: string, opts: ParseOptions = {}): ParsedMetFile {
  const warnings: ParseWarning[] = [];
  const warn = (line: number, code: ParseWarning['code'], detail: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push({ line, code, detail });
  };

  const empty = (reason: ParsedMetFile['rejectReason'], header: string[] = []): ParsedMetFile => ({
    ok: false,
    rejectReason: reason,
    header,
    rows: [],
    sensorsSeen: [],
    unitCode: null,
    stats: { totalLines: 0, dataLines: 0, skipped: 0, truncatedTail: false, firstTsMs: null, lastTsMs: null },
    warnings,
  });

  if (!text || text.trim() === '') return empty('EMPTY_FILE');

  // The station's uploader can cut a file mid-write, so a missing terminator
  // means the last row is partial and must be dropped. An admin upload has no
  // such risk — `assumeComplete` covers that.
  const truncatedTail = !opts.assumeComplete && !/\r?\n$/.test(text);
  const lines = text.split(/\r?\n/);
  const totalLines = lines.filter((l) => l.trim() !== '').length;

  const headerLine = lines.find((l) => l.trim() !== '');
  if (!headerLine) return empty('NO_HEADER');

  const header = splitCsvLine(headerLine).map((c) => c.trim());
  const specs = header.map((cell) => {
    const spec = specForEnvHeader(cell);
    if (!spec) warn(1, 'UNKNOWN_COLUMN', `"${cell}" is not a column this stream understands — ignored`);
    return spec;
  });

  // The only hard requirement. Without it there is nothing to place a reading at.
  if (!specs.some((s) => s?.field === '__timestamp')) return empty('NO_TIMESTAMP_COLUMN', header);

  const headerIndex = lines.indexOf(headerLine);
  const body = lines.slice(headerIndex + 1);
  // Drop a trailing partial row before it is parsed, not after.
  const usable = truncatedTail ? body.slice(0, -1) : body;

  const temps: number[] = [];
  const humidities: number[] = [];
  const pressures: number[] = [];
  let firstTsMs: number | null = null;
  let lastTsMs: number | null = null;
  let firstRaw = '';
  let dataLines = 0;
  let skipped = 0;

  for (let i = 0; i < usable.length; i++) {
    const raw = usable[i];
    if (raw.trim() === '') continue;
    dataLines++;
    const lineNo = headerIndex + 2 + i;

    const cells = splitCsvLine(raw);
    if (cells.length !== header.length) {
      warn(lineNo, 'COLUMN_COUNT_MISMATCH', `${cells.length} cells, header has ${header.length}`);
      skipped++;
      continue;
    }

    const picked = new Map<EnvField, string>();
    for (let c = 0; c < cells.length; c++) {
      const spec = specs[c];
      if (spec) picked.set(spec.field, cells[c]);
    }

    const tsMs = parseImportTimestampMs(picked.get('__timestamp') ?? '');
    if (tsMs === null) {
      warn(lineNo, 'BAD_TIMESTAMP', `"${picked.get('__timestamp') ?? ''}" is not a timestamp`);
      skipped++;
      continue;
    }
    // A bare date string parses as all-digits and lands in January 1970; the
    // upper bound catches a station whose clock has run away, which would
    // otherwise pin "latest reading" to a future date forever.
    if (tsMs < MIN_TS_MS || tsMs > Date.now() + FUTURE_TOLERANCE_MS) {
      warn(lineNo, 'TIMESTAMP_OUT_OF_RANGE', `${new Date(tsMs).toISOString()} outside [2020, now+48h]`);
      skipped++;
      continue;
    }

    if (firstTsMs === null) {
      firstTsMs = tsMs;
      firstRaw = raw;
    }
    lastTsMs = tsMs;

    const t = num(picked.get('tempC'));
    const h = num(picked.get('humidityPct'));
    const p = num(picked.get('pressureHpa'));
    if (t !== null) temps.push(t);
    if (h !== null) humidities.push(h);
    if (p !== null) pressures.push(p);
  }

  if (firstTsMs === null) return empty('NO_VALID_ROWS', header);

  const tempC = mean(temps);
  const humidityPct = mean(humidities);
  const pressureHpa = mean(pressures);

  // The minute is stamped at its FIRST reading, so a row sits at the start of the
  // minute it summarises rather than drifting to wherever the last sample landed.
  const row: ParsedMetRow = {
    timestampMs: firstTsMs,
    raw: firstRaw,
    windSpeedMs: null,
    windSpeedKmh: null,
    windSpeedKnots: null,
    windDirRelDeg: null,
    tempC,
    humidityPct,
    pressureHpa,
    // Not in the file; derived so the fog-risk and comfort panels have an input.
    dewPointC: dewPointC(tempC, humidityPct),
    solarWm2: null,
    precipMm: null,
    voltageV: null,
    gpsLat: null,
    gpsLng: null,
    status: null,
  };

  // Only what this minute actually carried. `dew_point` is included when it was
  // derivable, because from every consumer's point of view the station now
  // reports one.
  const sensorsSeen: string[] = [];
  if (tempC !== null) sensorsSeen.push('temperature');
  if (humidityPct !== null) sensorsSeen.push('humidity');
  if (pressureHpa !== null) sensorsSeen.push('pressure');
  if (row.dewPointC !== null) sensorsSeen.push('dew_point');

  return {
    ok: true,
    rejectReason: null,
    header,
    rows: [row],
    sensorsSeen,
    // A wind concept; this stream has no speed and therefore no speed unit.
    unitCode: null,
    stats: { totalLines, dataLines, skipped, truncatedTail, firstTsMs, lastTsMs },
    warnings,
  };
}
