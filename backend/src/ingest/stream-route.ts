export interface StreamRoute {
  prefix: string;
  streamType: string;
}

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
