import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security + route-protection middleware (plan §11). It:
 *  - stamps a per-request nonce and a strict, nonce-based CSP;
 *  - sets the remaining security headers;
 *  - redirects unauthenticated requests for protected pages to /login (the
 *    authoritative check still happens server-side in the (dash) layout + BFF).
 */

// Pages that are reachable without a session. Route groups like (auth)/(dash) are
// NOT URL segments, so we gate by real pathname.
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/signup'];
const SESSION_COOKIE = 'obs_admin_session';

function buildCsp(nonce: string, host: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  // The live socket is served from this page's own address (server.mjs hands it to
  // the API). 'self' covers ws: on the same origin in current browsers; the
  // explicit entries keep older ones working.
  const wsOrigins = host ? `ws://${host} wss://${host}` : '';
  return [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's nonce'd bootstrap load the rest; dev needs eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    // Uploaded logos are served by this app under /api/uploads — nothing external.
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${wsOrigins}${isDev ? ' ws: http:' : ''}`.trim(),
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `worker-src 'self' blob:`,
    // No `upgrade-insecure-requests`: the site portal is served over plain HTTP on
    // the local network, and that directive would rewrite every script and
    // stylesheet to https — a blank page.
  ].join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  // Only a plain host[:port] goes into the policy — never whatever a crafted Host
  // header carries, which could otherwise add directives of its own.
  const hostHeader = request.headers.get('host') ?? '';
  const host = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/.test(hostHeader) ? hostHeader : '';
  const csp = buildCsp(nonce, host);

  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // NB: we deliberately do NOT bounce /login → / on mere cookie presence. The
  // middleware only knows the cookie EXISTS, not that the session is LIVE (the
  // (dash) layout enforces liveness). A present-but-stale cookie — idled out, or
  // undecryptable after a SESSION_SECRET change — would otherwise ping-pong
  // /login ⇄ / forever. The "already logged in → skip login" redirect now lives
  // in the login page, where liveness is actually checked.

  // Gate protected pages.
  if (!hasSession && !isPublic) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  return response;
}

export const config = {
  // Run on pages, not on api / static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
