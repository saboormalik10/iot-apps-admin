/**
 * NMEA 0183 wind-speed unit codes.
 *
 * The station's raw sentence is `$IIMWV,284,R,001.26,K,A*1D` — field 4 is the
 * unit code. The logger passes it through verbatim into the CSV `units` column,
 * so the same single-letter vocabulary applies.
 *
 * Every observed row to date carries `K`. The client has said kph/msec/mph/knots
 * will become configurable, so all four are handled now rather than assumed.
 *
 * `K` is kilometres per hour, NOT knots — reading it as knots would inflate every
 * speed by a factor of ~1.85.
 */

export type SpeedUnit = 'kmh' | 'ms' | 'kn' | 'mph';

export const NMEA_SPEED_UNITS: Readonly<Record<string, SpeedUnit>> = Object.freeze({
  K: 'kmh',
  M: 'ms',
  N: 'kn',
  P: 'mph',
});

/** Multipliers to the base unit the whole analytics stack computes in: m/s. */
const TO_MS: Readonly<Record<SpeedUnit, number>> = Object.freeze({
  kmh: 1 / 3.6,
  ms: 1,
  kn: 0.514444,
  mph: 0.44704,
});

/**
 * Resolve an NMEA unit code. Returns null for anything unrecognised — the caller
 * records a warning and nulls the reading rather than guessing km/h, because a
 * wrong guess is silently wrong data.
 */
export function resolveSpeedUnit(code: string | null | undefined): SpeedUnit | null {
  if (!code) return null;
  return NMEA_SPEED_UNITS[code.trim().toUpperCase()] ?? null;
}

/** Convert to m/s, rounded to 3dp to keep float noise out of stored data. */
export function toMetresPerSecond(value: number, unit: SpeedUnit): number {
  return Math.round(value * TO_MS[unit] * 1000) / 1000;
}

export const msToKmh = (ms: number): number => Math.round(ms * 3.6 * 100) / 100;
export const msToKnots = (ms: number): number => Math.round((ms / 0.514444) * 100) / 100;
