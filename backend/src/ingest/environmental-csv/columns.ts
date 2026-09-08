import { createColumnIndex, type ColumnSpec as SharedColumnSpec } from '../registry/column-spec';

/**
 * The environmental stream's columns.
 *
 * Verified against the live station on 8 Sep 2026:
 *
 *   timestamp,temperature_C,humidity_percent,pressure_hPa
 *   2026-09-08T19:00:00+10:00,11.14,71.19,1018.06
 *
 * A SEPARATE spec from the MET one, not an extension of it. Each stream keeps
 * its own vocabulary and its own alias index, so one stream's `temperature`
 * cannot claim another's — and the Stream types screen can describe this format
 * accurately instead of calling it "WindSonic SFTP Logger output".
 *
 * `humidity_percent` is the reason this matters in practice. The MET spec lists
 * `humidity`, `humidity_%`, `rh` and `humidity_pct` — not `humidity_percent`.
 * Aliases match on EXACT equality (see `column-spec.ts`), so parsing these files
 * with the MET spec landed temperature and pressure and dropped humidity
 * silently: a whole sensor missing with no warning anywhere.
 */
export type EnvField = '__timestamp' | 'tempC' | 'humidityPct' | 'pressureHpa';

export type EnvColumnSpec = SharedColumnSpec<EnvField>;

export const ENV_COLUMNS: readonly EnvColumnSpec[] = Object.freeze([
  { field: '__timestamp', aliases: ['timestamp', 'time', 'datetime', 'date_time'], numeric: false },
  {
    field: 'tempC',
    aliases: ['temperature_c', 'temperature', 'temp', 'temp_c'],
    numeric: true,
  },
  {
    // `humidity_percent` first: it is what the station actually writes.
    field: 'humidityPct',
    aliases: ['humidity_percent', 'humidity', 'humidity_%', 'humidity_pct', 'rh'],
    numeric: true,
  },
  {
    field: 'pressureHpa',
    aliases: ['pressure_hpa', 'pressure', 'baro', 'barometer'],
    numeric: true,
  },
]);

const INDEX = createColumnIndex<EnvField>(ENV_COLUMNS);

export function specForEnvHeader(cell: string): EnvColumnSpec | null {
  return INDEX.specForHeader(cell);
}

/** Every header cell this parser recognises — used by the Stream types screen. */
export const ENV_ALIASES: readonly string[] = INDEX.aliases;
