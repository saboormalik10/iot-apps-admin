import { parseMetCsv } from '../met-csv/parse-met-csv';
import { COLUMNS } from '../met-csv/columns';
import { parseEnvironmentalCsv } from '../environmental-csv/parse-environmental-csv';
import { ENV_COLUMNS } from '../environmental-csv/columns';
import { registerStreamParser, getStreamParser, listStreamParsers } from './stream-parser';

export * from './stream-parser';
export * from './column-spec';

/**
 * Built-in stream types.
 *
 * Registered at import time, once, from this module — so anything importing the
 * registry sees the same set regardless of load order.
 *
 * `EnvDiagnostic_*` is deliberately NOT here. It is a per-second
 * `Accepted`/`No data` audit of the environmental sentence, not readings — but
 * it does carry a `timestamp` column, so the `NO_TIMESTAMP_COLUMN` guard would
 * not stop it. Parsed as either stream it would write ~60 all-null rows a minute
 * that look like data. Files reach a parser only through an explicit route (see
 * `StationAccount.streamRoutes`), so an unrouted prefix is skipped rather than
 * guessed at.
 */
let registered = false;

export function registerBuiltInParsers(): void {
  if (registered) return;
  registered = true;

  registerStreamParser({
    key: 'met-csv',
    label: 'Wind / MET CSV',
    description:
      'WindSonic SFTP Logger output: `timestamp,direction,speed,units,status`, one file per minute at 1 Hz. ' +
      'Handles both `direction` and `direction_deg` headers, K/M/N/P speed units, and empty directions below the ' +
      'sensor threshold.',
    filenameHint: /^(WindSonic|wind)_\d{8}_\d{4}\.csv$/i,
    // Published as DATA, so the admin UI can show what this stream understands.
    columns: COLUMNS,
    parse: (content, options) => parseMetCsv(content, options),
  });

  registerStreamParser({
    key: 'environmental-csv',
    label: 'Environmental (temp / humidity / pressure)',
    description:
      'Second serial port on the same mast: `timestamp,temperature_C,humidity_percent,pressure_hPa`, one file ' +
      'per minute at 1 Hz. Stored as ONE row per minute (the mean of that minute) — a whole minute moves the ' +
      'temperature 0.02 °C, so per-second rows would cost 48× the storage for less than the sensor can resolve. ' +
      'Dew point is derived from temperature and humidity, since the station does not report it.',
    filenameHint: /^Environmental_\d{8}_\d{4}\.csv$/i,
    columns: ENV_COLUMNS,
    parse: (content, options) => parseEnvironmentalCsv(content, options),
  });
}

registerBuiltInParsers();

export { getStreamParser, listStreamParsers };
