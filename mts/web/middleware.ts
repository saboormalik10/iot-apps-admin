import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, gateToken, safeEqual, sitePassword } from '@/lib/gate';

/**
 * Nothing is served to a browser that has not been unlocked (see lib/gate.ts).
 * The unlock page and its handler are the only routes left open, plus the static
 * files they need to render.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === '/unlock' || pathname === '/api/unlock') return NextResponse.next();

  const password = sitePassword();
  const cookie = req.cookies.get(GATE_COOKIE)?.value;
  if (password && cookie && safeEqual(cookie, await gateToken(password))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/unlock';
  url.search = pathname === '/' && !search ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own build assets and the icons the unlock page uses.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|robots.txt).*)'],
};
