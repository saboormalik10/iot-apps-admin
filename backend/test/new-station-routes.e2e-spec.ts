import 'dotenv/config';
import { resolveStreamType, DEFAULT_STREAM_ROUTES } from '../src/ingest/stream-route';

/**
 * A station has to read BOTH formats the day it is created.
 *
 * Stations were created with no routes, so the folder's `met-csv` fallback
 * claimed every file: wind worked, and `Environmental_` files went to the wind
 * parser, which knows none of their columns. Every new customer needed two
 * manual fixes — an agent prefix and a database route — that nobody would think
 * to make until the temperature charts stayed empty.
 */
describe('the routes a new station is created with', () => {
  const route = (filename: string) =>
    resolveStreamType(filename, DEFAULT_STREAM_ROUTES, 'met-csv');

  it('sends wind files to the wind parser', () => {
    expect(route('WindSonic_20260905_0016.csv')).toBe('met-csv');
  });

  it('sends environmental files to the ENVIRONMENTAL parser, not the wind one', () => {
    // The whole bug: this used to resolve to 'met-csv' and find no known column.
    expect(route('Environmental_20260905_0001.csv')).toBe('environmental-csv');
  });

  it('still reads the station’s older wind_ prefix', () => {
    // The prefix changed once, inside fifteen hours; those files still arrive.
    expect(route('wind_20260818_1028.csv')).toBe('met-csv');
  });

  it('SKIPS the diagnostic log — the guard these routes restore', () => {
    /**
     * `EnvDiagnostic_` is a per-second Accepted/No-data audit, not readings, and
     * it HAS a timestamp column — so `NO_TIMESTAMP_COLUMN`, the parser's only
     * hard guard, would not reject it. It would land as ~60 all-null rows a
     * minute: not an error anyone notices, just plausible junk beside real data.
     *
     * With no routes the fallback swallowed it. Skipping is what routes buy.
     */
    expect(route('EnvDiagnostic_20260905_0001.csv')).toBeNull();
  });

  it('skips anything else unrecognised rather than guessing', () => {
    expect(route('notes.txt')).toBeNull();
    expect(route('WindSonicBackup.csv')).toBeNull();
  });

  it('matches the LONGEST prefix, so Environmental cannot shadow EnvDiagnostic', () => {
    const ambiguous = [
      { prefix: 'Env', streamType: 'met-csv' },
      { prefix: 'Environmental_', streamType: 'environmental-csv' },
    ];
    expect(resolveStreamType('Environmental_x.csv', ambiguous, 'met-csv')).toBe('environmental-csv');
  });

  it('covers every format the station actually writes', () => {
    const prefixes = DEFAULT_STREAM_ROUTES.map((r) => r.prefix);
    expect(prefixes).toContain('WindSonic_');
    expect(prefixes).toContain('Environmental_');
    // If this ever includes EnvDiagnostic_, something has gone badly wrong.
    expect(prefixes).not.toContain('EnvDiagnostic_');
  });
});
