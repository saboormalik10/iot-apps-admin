import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security + route-protection middleware (plan §11). It:
 *  - stamps a per-request nonce and a strict, nonce-based CSP;
 *  - sets the remaining security headers;
 *  - redirects unauthenticated requests for protected pages to /login (the
 *    authoritative check still happens server-side in the (dash) layout + BFF).
 */

// Pages that are reachable without a session (auth group + the public share view).
// Route groups like (auth)/(dash)/(public) are NOT URL segments, so we gate by real
// pathname. `/s/<token>` is the unauthenticated read-only shared snapshot (§Month 11);
// it must not bounce anonymous viewers to /login. (`/s` matches only `/s` and `/s/…`,
// never `/sessions` / `/settings` / `/share`.)
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/accept-invite', '/s'];
const SESSION_COOKIE = 'obs_admin_session';

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const wsUrl = process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? '';
  // Allow the socket origin over wss + its https twin for the handshake.
  const wsOrigins = [wsUrl, wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')]
    .filter(Boolean)
    .join(' ');
  // Free OSM raster tiles for the MapLibre fleet map (no token/billing — plan §1).
  // Needed on img-src (tile images) and connect-src (MapLibre fetches tiles too).
  const tileOrigins = 'https://tile.openstreetmap.org https://*.tile.openstreetmap.org';

  return [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's nonce'd bootstrap load the rest; dev needs eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' https://res.cloudinary.com ${tileOrigins} data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${wsOrigins} ${tileOrigins}${isDev ? ' ws: http:' : ''}`.trim(),
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `worker-src 'self' blob:`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

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
  // Run on pages, not on api / static assets / the Sentry tunnel.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|monitoring).*)'],
};
