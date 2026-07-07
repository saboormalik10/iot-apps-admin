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

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    // Browsers that send this: only same-origin / none are trusted for mutations.
    return secFetchSite === 'same-origin' || secFetchSite === 'none';
  }

  // Fallback for clients without Sec-Fetch-Site: compare Origin host to Host.
  const origin = request.headers.get('origin');
  if (!origin) return false; // no origin on a mutation → reject
  try {
    const originHost = new URL(origin).host;
    const host = request.headers.get('host');
    return Boolean(host) && originHost === host;
  } catch {
    return false;
  }
}
