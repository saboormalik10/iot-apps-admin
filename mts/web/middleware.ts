import { NextResponse, type NextRequest } from 'next/server';
import { PUBLIC_PATHS, SESSION_COOKIE, safeEqual, sessionToken, siteAccount } from '@/lib/gate';

/**
 * Nothing is served without a signed-in session (see lib/gate.ts). The sign-in
 * and password-reset screens are the only pages left open, plus the static files
 * they need.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const account = siteAccount();
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (account && cookie && safeEqual(cookie, await sessionToken(account.email, account.password))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' && !search ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|robots.txt).*)'],
};
