/**
 * What the query screen can show — one entry per column a user can tick.
 *
 * The client (21 Sep 2026): *"a query screen allowing users to choose the
 * parameters they want and download as csv file. You can display the data also on
 * screen in tabular format."*
 *
 * Offered only when the station reports the sensor behind it (`sensor`, matched
 * against `Device.availableSensors`), so nobody ticks a column that can only ever
 * be empty. `minuteOnly` columns are themselves averages over a fixed window — a
 * daily mean of a 2-minute mean is not a thing anyone should read — so they exist
 * only at one-minute resolution.
 */

/** How a value's unit is chosen: the organisation's display unit, or fixed. */
export type UnitKind = 'windSpeed' | 'temperature' | 'pressure' | 'fixed';

export interface QueryColumn {
  key: string;
  label: string;
  kind: UnitKind;
  /** The unit, when `kind` is `fixed`. */
  unit?: string;
  /** Availability: the sensor key that must be in the station's availableSensors. */
  sensor: string | null;
  minuteOnly?: boolean;
}

export const QUERY_COLUMNS: readonly QueryColumn[] = Object.freeze([
  { key: 'windSpeed', label: 'Wind speed', kind: 'windSpeed', sensor: 'wind_speed' },
  { key: 'windDir', label: 'Wind direction', kind: 'fixed', unit: '°', sensor: 'wind_dir' },
  { key: 'windGust', label: 'Wind gust', kind: 'windSpeed', sensor: 'wind_speed' },
  { key: 'windSpeed2m', label: 'Wind speed, 2-min mean', kind: 'windSpeed', sensor: 'wind_speed', minuteOnly: true },
  { key: 'windDir2m', label: 'Wind direction, 2-min mean', kind: 'fixed', unit: '°', sensor: 'wind_dir', minuteOnly: true },
  { key: 'windSpeed10m', label: 'Wind speed, 10-min mean', kind: 'windSpeed', sensor: 'wind_speed', minuteOnly: true },
  { key: 'windDir10m', label: 'Wind direction, 10-min mean', kind: 'fixed', unit: '°', sensor: 'wind_dir', minuteOnly: true },
  { key: 'temperature', label: 'Temperature', kind: 'temperature', sensor: 'temperature' },
  { key: 'humidity', label: 'Humidity', kind: 'fixed', unit: '%', sensor: 'humidity' },
  { key: 'pressure', label: 'Pressure', kind: 'pressure', sensor: 'pressure' },
  { key: 'dewPoint', label: 'Dew point', kind: 'temperature', sensor: 'dew_point' },
  { key: 'rain', label: 'Rain', kind: 'fixed', unit: 'mm', sensor: 'precipitation' },
  // How complete each row is — readings in a minute (60 at 1 Hz), or minutes in
  // an hour or day. Always available; it is the first thing to look at when a
  // number looks wrong.
  { key: 'coverage', label: 'Readings', kind: 'fixed', unit: '', sensor: null },
]);

export const COLUMN_BY_KEY: ReadonlyMap<string, QueryColumn> = new Map(QUERY_COLUMNS.map((c) => [c.key, c]));

export type Resolution = 'minute' | 'hour' | 'day';
export const RESOLUTIONS: readonly Resolution[] = ['minute', 'hour', 'day'];

/** The coverage column's label depends on what a row is. */
export function coverageLabel(resolution: Resolution): string {
  return resolution === 'minute' ? 'Readings in the minute' : 'Minutes with data';
}
