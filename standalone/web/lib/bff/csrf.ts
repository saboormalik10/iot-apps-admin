import 'server-only';
import type { NextRequest } from 'next/server';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence for state-changing BFF routes (plan §11): the session cookie alone
 * must not be able to drive a mutation from another origin. We require either a
 * same-origin `Sec-Fetch-Site` signal, or an `Origin` header whose host matches
 * the request host. Safe (GET/HEAD) requests are exempt.
 */
export function isCsrfSafe(request: NextRequest): boolean {
  if (!MUTATING.has(request.method)) return true;

  // An Origin that does not match settles it, whatever else the request claims:
  // `Sec-Fetch-Site: none` used to be believed on its own, so a mismatched Origin
  // passed. A browser cannot forge either header, but nothing should be trusted
  // over the one that disagrees.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin) {
    try {
      if (!host || new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    // Browsers that send this: only same-origin / none are trusted for mutations.
    return secFetchSite === 'same-origin' || secFetchSite === 'none';
  }

  // No Sec-Fetch-Site (an older browser, or a script): a matching Origin is required.
  return Boolean(origin);
}
