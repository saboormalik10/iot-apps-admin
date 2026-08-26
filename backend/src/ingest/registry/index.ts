import { parseMetCsv } from '../met-csv/parse-met-csv';
import { COLUMNS } from '../met-csv/columns';
import { registerStreamParser, getStreamParser, listStreamParsers } from './stream-parser';

export * from './stream-parser';
export * from './column-spec';

/**
 * Built-in stream types.
 *
 * Registered at import time, once, from this module — so anything importing the
 * registry sees the same set regardless of load order. `met-csv` is the only
 * real one today: as of 24 Aug the server held 8,828 files and every one was
 * wind.
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
}

registerBuiltInParsers();

export { getStreamParser, listStreamParsers };
