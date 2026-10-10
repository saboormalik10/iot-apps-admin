import { gillChecksum, type GmxReading } from './gmx';

/**
 * The GMX551 in NMEA 0183 mode → one reading per output cycle.
 *
 * The client's sensor turned out to be set to NMEA, not Gill's ASCII (9 Oct 2026:
 * "$PGILT,A,+31,D,-58,D,+1,TILT*3D" was every line the PC was refusing). In NMEA
 * mode a MaxiMet does not send one line per reading: it sends a set of sentences
 * every output period, in a fixed order (MaxiMet manual, issue 11, appendix G):
 *
 *   $WIMWV,ddd,R,sss.ss,u,v*cc      wind relative to the unit's north marker
 *   $WIMWV,ddd,T,sss.ss,u,v*cc      compass-corrected wind (speed only with GPS)
 *   $WIXDR,t,±vvv.v,u,NAME,...*cc   TEMP, DEWP, PRESS, RH, SOLAR, PRECIP
 *   $GPGGA,...*cc                   position (GPS option only) — not used here
 *   $PGILT,A,±xx,D,±yy,D,±z,TILT*cc tilt — not used here
 *
 * WHERE A READING ENDS. Not by naming the last sentence — which ones a unit sends
 * depends on the variant and its options — but by the cycle starting again: when
 * a sentence comes round a second time, the ones gathered since its last turn are
 * one reading. A reader that connects mid-cycle simply starts its cycles there.
 * The reading is stamped with the time its cycle began.
 *
 * UNITS follow the unit's ASCII settings, so every unit letter the manual lists
 * is converted to the ones stored (m/s, °C, hPa, W/m², mm/h).
 *
 * RAIN. NMEA carries precipitation INTENSITY only (PRECIP, mm/h), never a total.
 * The rain in a cycle is its intensity over the cycle's length — capped, so a
 * pause in the stream is not filled with rain that was never measured — and is
 * handed on as `rainIntervalMm` for the site's running total.
 */

/** Longest stretch one cycle's intensity is taken to cover. */
const MAX_CYCLE_MS = 5_000;

const SPEED_TO_MS: Readonly<Record<string, number>> = { M: 1, N: 0.514444, S: 0.44704, K: 1 / 3.6, F: 0.00508 };
const PRESS_TO_HPA: Readonly<Record<string, number>> = { B: 1000, H: 1, R: 1, M: 1.33322, I: 33.8639 };

function toCelsius(v: number, unit: string): number | null {
  if (unit === 'C') return v;
  if (unit === 'F') return ((v - 32) * 5) / 9;
  if (unit === 'K') return v - 273.15;
  return null;
}

function num(token: string | undefined): number | null {
  const t = (token ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;

/** True for a line that is an NMEA sentence rather than Gill ASCII. */
export function isNmeaSentence(line: string): boolean {
  return line.trimStart().startsWith('$');
}

/** `$…*cc` → the body between `$` and `*`, whether the checksum matches, and whether there was one. */
export function unwrapNmea(line: string): { body: string; checksumOk: boolean; hasChecksum: boolean } {
  const s = line.trim();
  const star = s.lastIndexOf('*');
  if (star === -1) return { body: s.slice(1), checksumOk: true, hasChecksum: false };
  const body = s.slice(1, star);
  const given = s.slice(star + 1, star + 3);
  return { body, checksumOk: /^[0-9A-Fa-f]{2}$/.test(given) && given.toUpperCase() === gillChecksum(body), hasChecksum: true };
}

export type NmeaResult =
  | { kind: 'absorbed' }
  | { kind: 'rejected'; reason: 'CHECKSUM' }
  | { kind: 'data'; reading: GmxReading; atMs: number };

export interface NmeaReading extends GmxReading {
  /** Rain over this cycle, from its intensity (mm). Undefined when the unit sends no PRECIP. */
  rainIntervalMm?: number;
}

export class NmeaAssembler {
  private values: GmxReading['values'] = {};
  private status: string | null = null;
  private sentences: string[] = [];
  private seen = new Set<string>();
  private cycleStartMs: number | null = null;
  private lastCycleStartMs: number | null = null;

  /**
   * One sentence. Returns the PREVIOUS cycle as a reading when this sentence
   * starts a new one; otherwise the sentence is absorbed into the current cycle.
   */
  accept(line: string, atMs: number): NmeaResult {
    const { body, checksumOk } = unwrapNmea(line);
    if (!checksumOk) return { kind: 'rejected', reason: 'CHECKSUM' };
    const fields = body.split(',').map((f) => f.trim());
    const type = fields[0].toUpperCase();
    // The two MWV sentences are different members of the cycle.
    const key = type.endsWith('MWV') ? `${type}:${(fields[2] ?? '').toUpperCase()}` : type;

    let done: NmeaResult = { kind: 'absorbed' };
    if (this.seen.has(key)) {
      const reading = this.finish(atMs);
      if (reading) done = { kind: 'data', reading, atMs: this.lastCycleStartMs ?? atMs };
    }
    if (this.cycleStartMs === null) this.cycleStartMs = atMs;
    this.seen.add(key);
    this.sentences.push(line.trim());
    this.apply(type, fields);
    return done;
  }

  private apply(type: string, f: string[]): void {
    if (type.endsWith('MWV')) {
      // $WIMWV,ddd,R|T,sss.ss,u,A|V
      const valid = (f[5] ?? 'A').toUpperCase() !== 'V';
      const dir = valid ? num(f[1]) : null;
      const factor = SPEED_TO_MS[(f[4] ?? '').toUpperCase()];
      const raw = num(f[3]);
      const speed = valid && raw !== null && factor !== undefined ? round(raw * factor) : null;
      if (!valid) this.status = 'V';
      if ((f[2] ?? '').toUpperCase() === 'T') {
        this.values.cdir = dir;
        // Corrected speed is only sent with a GPS fitted.
        if (raw !== null) this.values.cspeed = speed;
      } else {
        this.values.dir = dir;
        this.values.speed = speed;
      }
      return;
    }
    if (type.endsWith('XDR')) {
      // Quadruplets: type, value, unit, name.
      for (let i = 1; i + 3 < f.length; i += 4) {
        const value = num(f[i + 1]);
        const unit = (f[i + 2] ?? '').toUpperCase();
        const name = (f[i + 3] ?? '').toUpperCase();
        if (!name) continue;
        switch (name) {
          case 'TEMP':
            this.values.temp = value === null ? null : nullable(toCelsius(value, unit));
            break;
          case 'DEWP':
            this.values.dewpoint = value === null ? null : nullable(toCelsius(value, unit));
            break;
          case 'PRESS': {
            const k = PRESS_TO_HPA[unit];
            this.values.press = value === null || k === undefined ? null : round(value * k, 2);
            break;
          }
          case 'RH':
            this.values.rh = value;
            break;
          case 'SOLAR':
            this.values.solar = value;
            break;
          case 'PRECIP':
            // mm/h is the only unit the manual lists for intensity.
            this.values.precipi = unit === 'M' ? value : null;
            break;
        }
      }
    }
    // $PGILT (tilt), $GPGGA (position) and anything else: part of the cycle, not stored.
  }

  /** The gathered cycle as a reading, and a fresh cycle. Null when it held nothing to store. */
  private finish(nowMs: number): NmeaReading | null {
    const values = this.values;
    const start = this.cycleStartMs ?? nowMs;
    const prev = this.lastCycleStartMs;
    const reading: NmeaReading = { node: null, status: this.status, values, raw: this.sentences.join(' ') };
    if (typeof values.precipi === 'number' && values.precipi >= 0) {
      const ms = prev === null ? 0 : Math.min(Math.max(start - prev, 0), MAX_CYCLE_MS);
      reading.rainIntervalMm = (values.precipi * ms) / 3_600_000;
    }
    this.lastCycleStartMs = start;
    this.values = {};
    this.status = null;
    this.sentences = [];
    this.seen = new Set();
    this.cycleStartMs = null;
    return Object.values(values).some((v) => v !== null && v !== undefined) ? reading : null;
  }
}

function nullable(v: number | null): number | null {
  return v === null ? null : round(v);
}
