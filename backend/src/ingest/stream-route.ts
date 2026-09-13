export interface StreamRoute {
  prefix: string;
  streamType: string;
}

/**
 * What a NEW station is given, so both formats work the day it is created.
 *
 * Every station in this deployment writes wind and environmental files into one
 * folder. Stations used to be created with no routes at all, which meant the
 * folder's `met-csv` fallback claimed every file: wind ingested, and
 * `Environmental_` files were read by the WIND parser, which finds no columns it
 * knows. Each new customer therefore needed two manual fixes nobody would think
 * to make until their temperature charts stayed empty.
 *
 * Setting these also RESTORES the EnvDiagnostic guard for new stations. With no
 * routes the fallback swallows everything, including that per-second audit log;
 * with routes, an unmatched prefix is skipped, which is the whole point of the
 * mechanism.
 *
 * `wind_` is here because the station's own prefix changed once, inside fifteen
 * hours, and files under the old name still arrive.
 */
export const DEFAULT_STREAM_ROUTES: readonly StreamRoute[] = Object.freeze([
  { prefix: 'WindSonic_', streamType: 'met-csv' },
  { prefix: 'wind_', streamType: 'met-csv' },
  { prefix: 'Environmental_', streamType: 'environmental-csv' },
]);

/**
 * Which stream type reads this file — decided per FILE, not per folder.
 *
 * The client's station writes three formats into one folder:
 *
 *   WindSonic_20260908_1900.csv     wind
 *   Environmental_20260908_1900.csv temperature / humidity / pressure
 *   EnvDiagnostic_20260908_1900.csv a per-second audit of the sentence above
 *
 * `StationAccount.streamType` is one value per folder, so it cannot express
 * that. Routes are matched against the basename, LONGEST PREFIX FIRST so a
 * shorter prefix cannot shadow a longer one that also matches — `Env` would
 * otherwise claim both `Environmental_` and `EnvDiagnostic_` depending on the
 * order someone happened to type them in.
 *
 * Returns `null` when nothing matches, and the caller must SKIP the file.
 * Falling back to the folder's default is what makes this dangerous: an
 * `EnvDiagnostic_` file has a `timestamp` column, so `NO_TIMESTAMP_COLUMN` — the
 * parser's only hard guard — would not reject it. It would be accepted as ~60
 * all-null rows a minute, which is not an error anyone would notice; it is
 * plausible-looking junk sitting beside real readings.
 *
 * With no routes configured the folder's `fallback` applies to everything, so
 * every station registered before routing existed behaves exactly as before.
 */
export function resolveStreamType(
  filename: string,
  routes: readonly StreamRoute[] | undefined,
  fallback: string,
): string | null {
  const name = basename(filename);
  if (!routes || routes.length === 0) return fallback;

  const matched = [...routes]
    .filter((r) => r.prefix && name.toLowerCase().startsWith(r.prefix.toLowerCase()))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return matched ? matched.streamType : null;
}

/** Basename of a path the agent reported, which always uses POSIX separators. */
function basename(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? rel : rel.slice(i + 1);
}
