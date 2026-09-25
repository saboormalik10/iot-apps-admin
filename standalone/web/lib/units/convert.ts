/**
 * Unit conversion for display.
 *
 * Deliberately a CLIENT-side mirror of the backend's `analytics.util.ts` tables,
 * not a call to its `/analytics/unit-convert` endpoint. Every number on a chart,
 * tile, table cell and tooltip would otherwise need a round trip, and switching
 * the preference would refetch the entire page instead of re-rendering it. The
 * factors are exact and tiny; the coupling risk is that the two copies drift, so
 * both sides carry a pointer to the other.
 *
 * The API always returns readings in CANONICAL units — m/s, hPa, °C, m — because
 * that is how `MetMeasure` stores them (`windSpeedMs`, `pressureHpa`, `tempC`,
 * `gpsAltM`). Conversion is therefore always canonical → chosen, one direction,
 * and nothing here is ever used to write a value back.
 */

/** What the API hands us, per family. Also the fallback for an unknown unit. */
export const CANONICAL = {
  windSpeed: 'm/s',
  pressure: 'hPa',
  temperature: '°C',
  altitude: 'm',
} as const;

export type UnitFamily = keyof typeof CANONICAL;

export const UNIT_OPTIONS: Record<UnitFamily, readonly string[]> = {
  windSpeed: ['m/s', 'km/h', 'knots', 'mph', 'bft'],
  pressure: ['hPa', 'mbar', 'inHg', 'mmHg'],
  temperature: ['°C', '°F'],
  altitude: ['m', 'ft'],
};

/**
 * Which family a canonical unit string belongs to, so a render site can pass the
 * unit it already has (`'hPa'`) instead of naming a family.
 *
 * Only CANONICAL strings appear here on purpose: a site that hardcoded `'°C'` is
 * describing stored data, and one that somehow passes `'°F'` has already
 * converted, so returning `null` leaves it untouched rather than double-shifting.
 */
const FAMILY_OF_CANONICAL: Record<string, UnitFamily> = {
  'm/s': 'windSpeed',
  hPa: 'pressure',
  '°C': 'temperature',
  m: 'altitude',
};

export const familyOfCanonical = (unit: string): UnitFamily | null =>
  FAMILY_OF_CANONICAL[unit] ?? null;

// ─── Wind speed (from m/s) ──────────────────────────────────────────────────
// Mirrors MS_TO_WIND. `bft` is the Beaufort force number, which is a SCALE, not
// a linear unit — see `beaufortFromMs` for the band it names.
const FROM_MS: Record<string, (v: number) => number> = {
  'm/s': (v) => v,
  'km/h': (v) => v * 3.6,
  kt: (v) => v / 0.514444,
  knots: (v) => v / 0.514444,
  mph: (v) => v / 0.44704,
  bft: (v) => 0.836 * Math.pow(v, 1.5),
};

// ─── Pressure (from hPa) ────────────────────────────────────────────────────
// Mirrors HPA_TO_PRESSURE. hPa and mbar are the same magnitude — the choice is
// which name the customer prefers to read, so the "conversion" is identity.
const FROM_HPA: Record<string, (v: number) => number> = {
  hPa: (v) => v,
  mbar: (v) => v,
  inHg: (v) => v / 33.8639,
  mmHg: (v) => v / 1.33322,
};

// ─── Temperature (from °C) ──────────────────────────────────────────────────
const FROM_C: Record<string, (v: number) => number> = {
  '°C': (v) => v,
  '°F': (v) => (v * 9) / 5 + 32,
};

// ─── Altitude (from m) ──────────────────────────────────────────────────────
const FROM_M: Record<string, (v: number) => number> = {
  m: (v) => v,
  ft: (v) => v / 0.3048,
};

const CONVERTERS: Record<UnitFamily, Record<string, (v: number) => number>> = {
  windSpeed: FROM_MS,
  pressure: FROM_HPA,
  temperature: FROM_C,
  altitude: FROM_M,
};

/**
 * Convert a canonical value into `to`.
 *
 * `null` in, `null` out — a missing reading must stay missing rather than become
 * a zero, because a chart cannot tell the two apart once it has a number. An
 * unrecognised target returns the value UNCHANGED: rendering the canonical
 * number is wrong-labelled at worst, whereas returning null would erase a
 * reading the station actually took.
 */
export function convert(value: number | null | undefined, family: UnitFamily, to: string): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const fn = CONVERTERS[family][to];
  return fn ? fn(value) : value;
}

/**
 * How many decimals a unit deserves.
 *
 * A conversion changes the useful precision, not just the number: 1013 hPa is a
 * whole number people read at a glance, but the same reading in inHg is 29.91 —
 * rounded to 0 dp it would show as "30" for a 20 hPa spread, which is a
 * different weather situation. Beaufort is an integer force by definition.
 */
export function decimalsFor(family: UnitFamily, unit: string, base = 1): number {
  if (family === 'pressure') return unit === 'inHg' || unit === 'mmHg' ? 2 : base;
  if (family === 'windSpeed') return unit === 'bft' ? 0 : base;
  if (family === 'altitude') return 0;
  return base;
}

/**
 * Units whose mapping from canonical is NOT affine, so a difference cannot be
 * converted at all. Beaufort is a power law: the gap between force 3 and force 4
 * is not the same number of m/s as between 7 and 8, so "+2 bft over 3 hours" has
 * no single meaning.
 */
const NON_AFFINE = new Set(['bft']);

/**
 * Convert a DIFFERENCE between two canonical readings.
 *
 * Not the same operation as converting a reading: °C → °F scales by 9/5 AND adds
 * 32, and adding the offset to a delta would turn "rose by 5 °C" into "rose by
 * 41 °F". Subtracting the image of zero removes the offset and leaves the scale,
 * which is correct for every affine family here.
 *
 * Returns the unit alongside the number, because a non-affine target has no
 * valid delta — the caller is handed the canonical unit instead, so it labels
 * what it is actually showing rather than mislabelling a converted figure.
 */
export function convertDelta(
  value: number | null | undefined,
  family: UnitFamily,
  to: string,
): { value: number | null; unit: string } {
  if (NON_AFFINE.has(to)) return { value: value ?? null, unit: CANONICAL[family] };
  const zero = convert(0, family, to) ?? 0;
  const shifted = convert(value, family, to);
  return { value: shifted == null ? null : shifted - zero, unit: to };
}

/**
 * Convert and stringify in one step.
 *
 * Formats through `toLocaleString` and returns the SAME en-dash placeholder as
 * `fmt` in components/charts/chart-utils — a tile that switched to this helper
 * must not start showing a different "no reading" mark from the tile beside it.
 */
export function formatIn(
  value: number | null | undefined,
  family: UnitFamily,
  to: string,
  decimals?: number,
): string {
  const v = convert(value, family, to);
  if (v == null) return '–';
  const digits = decimals ?? decimalsFor(family, to);
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
