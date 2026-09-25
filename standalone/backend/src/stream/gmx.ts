import { ETX, STX } from './framing';

/**
 * One line of Gill GMX551 (MaxiMet) output → named, unit-converted values.
 *
 * THERE IS NO REAL SAMPLE YET. The client has no sensor (22 Sep 2026), so this
 * follows Gill's MaxiMet manual, and the first real connection is where any
 * difference will show. It is written so that a difference is configuration:
 *
 *  - Columns are mapped BY NAME from the header line the unit sends at power-up,
 *    so a different field order or an extra field changes nothing here. Until a
 *    header arrives — the reader usually connects long after power-up — the
 *    order in `STREAM_FIELDS` is used.
 *  - Units come from the units line that follows the header, and are converted
 *    to the ones stored (m/s, °C, hPa, mm).
 *  - The checksum is validated when present and, by default, not required.
 *
 * A data line looks like
 *   <STX>Q,164,000.08,164,000.08,+024.8,048,1011.7,00000.000,000.000,0000,<ETX>1F
 * — node letter first, a trailing comma before ETX, then two hex digits: the XOR
 * of every byte between STX and ETX.
 */

/** The GMX551 fields this reader understands, by the name the unit gives them. */
export type GmxField =
  | 'node'
  | 'dir'
  | 'speed'
  | 'cdir'
  | 'cspeed'
  | 'temp'
  | 'rh'
  | 'press'
  | 'dewpoint'
  | 'precipt'
  | 'precipi'
  | 'solar'
  | 'volt'
  | 'status'
  | 'check';

/** Header name → field. Exact and case-insensitive; anything else is ignored. */
const HEADER_NAMES: Readonly<Record<string, GmxField>> = Object.freeze({
  NODE: 'node',
  DIR: 'dir',
  SPEED: 'speed',
  CDIR: 'cdir',
  CSPEED: 'cspeed',
  TEMP: 'temp',
  RH: 'rh',
  PRESS: 'press',
  DEWPOINT: 'dewpoint',
  PRECIPT: 'precipt',
  PRECIPI: 'precipi',
  SOLARRAD: 'solar',
  VOLT: 'volt',
  SUPPLYV: 'volt',
  STATUS: 'status',
  CHECK: 'check',
});

/** The manual's default output order — the fallback before a header is seen. */
export const DEFAULT_GMX_FIELDS: readonly string[] = Object.freeze([
  'NODE', 'DIR', 'SPEED', 'CDIR', 'CSPEED', 'TEMP', 'RH', 'PRESS', 'PRECIPT', 'PRECIPI', 'STATUS', 'CHECK',
]);

/** Unit tokens as the units line writes them → factor/offset to the stored unit. */
type Converter = (v: number) => number;
const UNITS: Readonly<Record<string, Converter>> = Object.freeze({
  // speed → m/s
  MS: (v) => v,
  'M/S': (v) => v,
  KMH: (v) => v / 3.6,
  'KM/H': (v) => v / 3.6,
  KPH: (v) => v / 3.6,
  KTS: (v) => v * 0.514444,
  KT: (v) => v * 0.514444,
  KNOTS: (v) => v * 0.514444,
  MPH: (v) => v * 0.44704,
  FPM: (v) => v * 0.00508,
  // temperature → °C
  C: (v) => v,
  F: (v) => ((v - 32) * 5) / 9,
  K: (v) => v - 273.15,
  // pressure → hPa
  HPA: (v) => v,
  MB: (v) => v,
  MBAR: (v) => v,
  KPA: (v) => v * 10,
  INHG: (v) => v * 33.8639,
  MMHG: (v) => v * 1.33322,
  // rain → mm, intensity → mm/h
  MM: (v) => v,
  IN: (v) => v * 25.4,
  'MM/H': (v) => v,
  'MM/HR': (v) => v,
  'IN/H': (v) => v * 25.4,
  'IN/HR': (v) => v * 25.4,
  // dimensionless
  DEG: (v) => v,
  '%': (v) => v,
  V: (v) => v,
  'W/M2': (v) => v,
  '-': (v) => v,
});

export type ChecksumMode = 'auto' | 'require' | 'off';

/** A reading, in stored units. Absent means the unit does not send the field. */
export interface GmxReading {
  node: string | null;
  status: string | null;
  values: Partial<Record<Exclude<GmxField, 'node' | 'status' | 'check'>, number | null>>;
  /** The line as received, framing stripped — stored for provenance. */
  raw: string;
}

export type GmxRejectReason = 'CHECKSUM' | 'UNFRAMED' | 'COLUMN_COUNT';

export type GmxLineResult =
  | { kind: 'header'; fields: string[] }
  | { kind: 'units'; units: string[] }
  | { kind: 'data'; reading: GmxReading }
  | { kind: 'rejected'; reason: GmxRejectReason };

/** Gill's checksum: XOR of every byte between STX and ETX, as two hex digits. */
export function gillChecksum(payload: string): string {
  let x = 0;
  for (let i = 0; i < payload.length; i++) x ^= payload.charCodeAt(i) & 0xff;
  return x.toString(16).toUpperCase().padStart(2, '0');
}

/** `+024.8`, `00000.000` → numbers; blanks and anything else → null. */
function toNumber(token: string): number | null {
  const t = token.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export class GmxParser {
  /** Current column order, as the unit named them (upper case). */
  private columns: string[];
  /** Current units per column, parallel to `columns`; empty until a units line. */
  private units: string[] = [];
  /** True right after a header, when the next line may be its units line. */
  private expectUnits = false;

  constructor(
    defaultFields: readonly string[] = DEFAULT_GMX_FIELDS,
    private readonly checksum: ChecksumMode = 'auto',
  ) {
    this.columns = defaultFields.map((f) => f.trim().toUpperCase());
  }

  /** The column order in use, for the status page. */
  get fields(): readonly string[] {
    return this.columns;
  }

  accept(line: string): GmxLineResult {
    const { payload, check, checkMalformed, framed } = unframe(line);
    const tokens = payload.split(',');
    // Gill writes a comma after the last value, before ETX.
    if (tokens.length > 1 && tokens[tokens.length - 1].trim() === '') tokens.pop();

    // A header or units line is recognised before the checksum rule applies: the
    // unit may send them unframed, and they carry no reading to protect.
    if (isHeader(tokens)) {
      this.columns = tokens.map((t) => t.trim().toUpperCase());
      this.units = [];
      this.expectUnits = true;
      return { kind: 'header', fields: [...this.columns] };
    }
    if (this.expectUnits && isUnitsLine(tokens)) {
      this.units = tokens.map((t) => t.trim().toUpperCase());
      this.expectUnits = false;
      return { kind: 'units', units: [...this.units] };
    }
    this.expectUnits = false;

    if (this.checksum !== 'off') {
      if (checkMalformed) return { kind: 'rejected', reason: 'CHECKSUM' };
      if (check) {
        if (check.toUpperCase() !== gillChecksum(payload)) return { kind: 'rejected', reason: 'CHECKSUM' };
      } else if (this.checksum === 'require') {
        return { kind: 'rejected', reason: framed ? 'CHECKSUM' : 'UNFRAMED' };
      }
    }

    // CHECK is named in the header but travels after ETX, not among the values.
    const valueColumns = this.columns[this.columns.length - 1] === 'CHECK' ? this.columns.slice(0, -1) : this.columns;
    // A count mismatch means the column order is wrong — mapping by position
    // would file every value under the wrong name. Refused, and counted, so the
    // status page can say the fields setting needs looking at.
    if (tokens.length !== valueColumns.length) return { kind: 'rejected', reason: 'COLUMN_COUNT' };

    const reading: GmxReading = { node: null, status: null, values: {}, raw: payload };
    valueColumns.forEach((name, i) => {
      const field = HEADER_NAMES[name];
      if (!field || field === 'check') return;
      const token = tokens[i];
      if (field === 'node') {
        reading.node = token.trim() || null;
        return;
      }
      if (field === 'status') {
        reading.status = token.trim() || null;
        return;
      }
      const n = toNumber(token);
      const unit = this.units[i];
      const convert = unit ? UNITS[unit] : undefined;
      // An unrecognised unit is stored as sent rather than guessed at; the
      // default for every field here is already the stored unit.
      reading.values[field] = n === null ? null : round(convert ? convert(n) : n, 3);
    });
    return { kind: 'data', reading };
  }
}

/** Strip `<STX>…<ETX>cs`; report the checksum and whether the line was framed. */
function unframe(line: string): { payload: string; check: string | null; checkMalformed: boolean; framed: boolean } {
  const s = line.indexOf(STX);
  const e = line.indexOf(ETX);
  if (s !== -1 && e > s) {
    const check = line.slice(e + 1).trim();
    const valid = /^[0-9A-Fa-f]{2}$/.test(check);
    // Something IS there after ETX but it is not a checksum: the two bytes that
    // protect the line are themselves corrupt. Treated as a failed checksum, not
    // as "this sensor sends none" — which is what it used to mean, so a corrupted
    // reading was stored as good data and nothing counted it.
    return { payload: line.slice(s + 1, e), check: valid ? check : null, checkMalformed: check.length > 0 && !valid, framed: true };
  }
  return { payload: line.replace(STX, '').replace(ETX, '').trim(), check: null, checkMalformed: false, framed: false };
}

/** A header names fields: at least three known names and no numbers. */
function isHeader(tokens: string[]): boolean {
  let known = 0;
  for (const t of tokens) {
    const u = t.trim().toUpperCase();
    if (toNumber(u) !== null) return false;
    if (HEADER_NAMES[u]) known += 1;
  }
  return known >= 3;
}

/** A units line is nothing but unit tokens. */
function isUnitsLine(tokens: string[]): boolean {
  return tokens.length > 1 && tokens.every((t) => UNITS[t.trim().toUpperCase()] !== undefined);
}
