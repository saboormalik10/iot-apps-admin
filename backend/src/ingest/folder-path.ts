/**
 * Normalise and validate an upload folder path.
 *
 * The path arrives from the agent and is used to ROUTE data to a customer, so it
 * is treated as untrusted input: a `..` segment or an absolute path could point a
 * batch at another tenant's station.
 *
 * `/upload/Observator/Demo Tower/` → `Observator/Demo Tower`
 * The flat legacy layout (files directly in the upload root) normalises to `''`.
 *
 * Names may contain spaces and capitals — the client's own folder is literally
 * `Demo Tower` — so case is preserved and only the separators are cleaned up.
 */
export function normaliseFolderPath(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = String(raw)
    .replace(/\\/g, '/')          // tolerate Windows separators from the logger
    .replace(/\/+/g, '/')         // collapse doubles
    .replace(/^\/+|\/+$/g, '')    // strip leading and trailing
    .trim();
  return cleaned;
}

/** Segments that must never appear in a routing path. */
const UNSAFE = /(^|\/)\.\.?($|\/)/;

export function isSafeFolderPath(path: string): boolean {
  if (path === '') return true;                 // the flat layout is legitimate
  if (path.length > 200) return false;
  if (UNSAFE.test(path)) return false;          // `..` traversal, or a bare `.`
  if (path.includes('\0')) return false;
  // Two levels is the agreed shape (<Customer>/<Tower>); allow three for a
  // future grouping level, but not unbounded nesting.
  if (path.split('/').length > 3) return false;
  return /^[\w .\-()/]+$/.test(path);
}

/**
 * Normalise, then reject anything unsafe. Returns null when it cannot be used.
 *
 * A LEADING SLASH is stripped, not rejected: `/upload/Demo Tower` is how the
 * client's own logger expresses the folder, and it is syntactically identical to
 * `/etc/passwd` — there is no way to tell "absolute" from "relative with a
 * leading slash" by inspection.
 *
 * That is fine, because this value is only ever a LOOKUP KEY against
 * pre-registered `StationAccount` rows. A path naming nothing registered
 * resolves to UNKNOWN_STATION and is rejected there. What must never get through
 * is a `..` segment, which could match a DIFFERENT customer's registered folder.
 */
export function safeFolderPath(raw: string | null | undefined): string | null {
  const path = normaliseFolderPath(raw);
  return isSafeFolderPath(path) ? path : null;
}
