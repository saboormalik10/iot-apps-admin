import { createColumnIndex, type ColumnSpec as SharedColumnSpec } from '../registry/column-spec';

/**
 * Declarative column registry — the single place that knows what a header cell
 * means. Adding a sensor is one entry here and nothing else.
 *
 * WHY BY NAME, NEVER BY POSITION
 * Two header variants already exist in the wild on the same station:
 *
 *   timestamp,direction,speed,units,status          ← current (WindSonic_*)
 *   timestamp,direction_deg,speed,units,status      ← earlier (wind_*)
 *
 * The prefix changed once inside 15 hours, so column order is not a contract.
 *
 * WHY EXACT MATCH, NEVER `includes`
 * `direction` is a substring of `direction_deg`. A substring or prefix match
 * would bind the wrong spec depending on registry order, and it would do so
 * silently. Matching is exact equality on the lowercased, trimmed cell.
 */

/** Fields prefixed `__` are consumed by the parser itself, not stored directly. */
export type CanonicalField =
  | '__timestamp'
  | '__speed'
  | '__units'
  | '__status'
  | 'windDirRelDeg'
  | 'tempC'
  | 'humidityPct'
  | 'pressureHpa'
  | 'dewPointC'
  | 'solarWm2'
  | 'precipMm'
  | 'voltageV'
  | 'gpsLat'
  | 'gpsLng';

/**
 * The MET stream's columns, in the SHARED spec shape.
 *
 * Re-exported under the local name so existing importers are unaffected. The
 * shape now lives in `registry/column-spec.ts` because every stream type
 * describes its format the same way — that is what makes a new sensor an entry
 * in an array rather than a change to a parser.
 *
 * `fixedUnit` covers columns whose NAME carries the unit (`WindSpeed_ms`),
 * rather than a separate `units` column. Our own MET export writes those, so
 * without them an exported file could not be re-imported.
 */
export type ColumnSpec = SharedColumnSpec<CanonicalField>;

export const COLUMNS: readonly ColumnSpec[] = Object.freeze([
  { field: '__timestamp', aliases: ['timestamp', 'time', 'datetime', 'date_time'], numeric: false },
  { field: 'windDirRelDeg', aliases: ['direction', 'direction_deg', 'winddir', 'winddir_deg', 'dir'], numeric: true },
  { field: '__speed', aliases: ['speed', 'windspeed', 'wind_speed', 'speed_value'], numeric: true },
  // Unit-in-the-name variants, as written by our own MET export.
  { field: '__speed', aliases: ['windspeed_ms', 'wind_speed_ms', 'speed_ms'], numeric: true, fixedUnit: 'ms' },
  { field: '__speed', aliases: ['windspeed_kmh', 'wind_speed_kmh', 'speed_kmh'], numeric: true, fixedUnit: 'kmh' },
  { field: '__speed', aliases: ['windspeed_knots', 'speed_knots'], numeric: true, fixedUnit: 'kn' },
  { field: '__units', aliases: ['units', 'unit'], numeric: false },
  { field: '__status', aliases: ['status', 'stat'], numeric: false },

  // Not yet emitted by the station. The client is fitting a fuller weather
  // station; these land the day its header grows, with no code change.
  { field: 'tempC', aliases: ['temperature', 'temp', 'temp_c', 'temperature_c'], numeric: true },
  { field: 'humidityPct', aliases: ['humidity', 'humidity_%', 'rh', 'humidity_pct'], numeric: true },
  { field: 'pressureHpa', aliases: ['pressure', 'pressure_hpa', 'baro', 'barometer'], numeric: true },
  { field: 'dewPointC', aliases: ['dewpoint', 'dew_point', 'dewpoint_c'], numeric: true },
  { field: 'solarWm2', aliases: ['solar', 'solar_wm2', 'radiation'], numeric: true },
  { field: 'precipMm', aliases: ['precipitation', 'precip', 'precip_mm', 'rain'], numeric: true },
  // Present in our export; recorded so they do not raise UNKNOWN_COLUMN, even
  // though MetMeasure keeps them outside the sensor set.
  { field: 'voltageV', aliases: ['voltage', 'voltage_v'], numeric: true },
  { field: 'gpsLat', aliases: ['lat', 'latitude'], numeric: true },
  { field: 'gpsLng', aliases: ['lng', 'lon', 'longitude'], numeric: true },
]);

/**
 * The MET alias index, built by the shared factory.
 *
 * Per-stream rather than global: one stream's `temperature` must not silently
 * claim another's. Alias collisions throw at module load, not at parse time —
 * discovering one while reading a customer's file would mean attributing their
 * readings to the wrong field.
 */
const INDEX = createColumnIndex<CanonicalField>(COLUMNS);

/** Exact, case-insensitive lookup. Returns null for an unrecognised header cell. */
export function specForHeader(cell: string): ColumnSpec | null {
  return INDEX.specForHeader(cell);
}

/** Canonical field names a caller can expect to see stored (the `__` ones are internal). */
export const STORED_FIELDS: readonly CanonicalField[] = INDEX.storedFields;

/** Every header cell the MET parser recognises — used by the preview screen. */
export const MET_ALIASES: readonly string[] = INDEX.aliases;

/**
 * Canonical field → the sensor key used by `availableSensors`, the analytics
 * pickers and the alert-rule sensor map. Kept here so the two vocabularies are
 * reconciled in exactly one place.
 */
export const FIELD_TO_SENSOR_KEY: Readonly<Partial<Record<CanonicalField, string>>> = Object.freeze({
  windDirRelDeg: 'wind_dir',
  tempC: 'temperature',
  humidityPct: 'humidity',
  pressureHpa: 'pressure',
  dewPointC: 'dew_point',
  solarWm2: 'solar',
  precipMm: 'precipitation',
});
