import { resolveStreamType } from '../src/ingest/stream-route';

/**
 * Routing decides which parser reads a file. Getting it wrong does not throw —
 * it writes plausible-looking junk beside real readings, which is the worst
 * failure available here.
 */
const ROUTES = [
  { prefix: 'WindSonic_', streamType: 'met-csv' },
  { prefix: 'Environmental_', streamType: 'environmental-csv' },
];

describe('stream routing by filename prefix', () => {
  it('sends each format to its own parser, from the SAME folder', () => {
    expect(resolveStreamType('Demo Tower/WindSonic_20260908_1900.csv', ROUTES, 'met-csv')).toBe('met-csv');
    expect(resolveStreamType('Demo Tower/Environmental_20260908_1900.csv', ROUTES, 'met-csv')).toBe(
      'environmental-csv',
    );
  });

  it('SKIPS an unrouted prefix instead of falling back', () => {
    // The whole point. EnvDiagnostic_ has a `timestamp` column, so the parser's
    // only hard guard would not reject it — it would ingest ~60 all-null rows a
    // minute that look like data.
    expect(resolveStreamType('Demo Tower/EnvDiagnostic_20260908_1900.csv', ROUTES, 'met-csv')).toBeNull();
    expect(resolveStreamType('something-else.csv', ROUTES, 'met-csv')).toBeNull();
  });

  it('prefers the LONGER prefix, whatever order the routes are in', () => {
    // `Env` matches both `Environmental_` and `EnvDiagnostic_`; without
    // longest-first the shorter one would claim files by luck of ordering.
    const overlapping = [
      { prefix: 'Env', streamType: 'catch-all' },
      { prefix: 'Environmental_', streamType: 'environmental-csv' },
    ];
    expect(resolveStreamType('Environmental_20260908_1900.csv', overlapping, 'met-csv')).toBe('environmental-csv');
    expect(resolveStreamType('Environmental_20260908_1900.csv', [...overlapping].reverse(), 'met-csv')).toBe(
      'environmental-csv',
    );
    // And the short one still catches what only it matches.
    expect(resolveStreamType('EnvDiagnostic_20260908_1900.csv', overlapping, 'met-csv')).toBe('catch-all');
  });

  it('falls back to the folder default when no routes are configured', () => {
    // Every station registered before routing existed must behave as before.
    expect(resolveStreamType('WindSonic_20260908_1900.csv', [], 'met-csv')).toBe('met-csv');
    expect(resolveStreamType('anything.csv', undefined, 'met-csv')).toBe('met-csv');
  });

  it('matches the basename, not the folder', () => {
    // A tower called "Environmental" must not route its wind files.
    expect(resolveStreamType('Environmental/WindSonic_20260908_1900.csv', ROUTES, 'met-csv')).toBe('met-csv');
  });

  it('is case-insensitive, as filesystems and loggers vary', () => {
    expect(resolveStreamType('environmental_20260908_1900.csv', ROUTES, 'met-csv')).toBe('environmental-csv');
  });
});
