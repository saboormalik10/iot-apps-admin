import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, GATE_MAX_AGE, gateToken, safeEqual, safeNext, sitePassword } from '@/lib/gate';

/**
 * Checks the preview password and, if it is right, remembers this browser.
 * A plain form post, so the gate works before any script has loaded.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const given = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? '/'));
  const password = sitePassword();

  if (!password || !safeEqual(await gateToken(given), await gateToken(password))) {
    // Slow every wrong guess down; there is no account to lock.
    await new Promise((r) => setTimeout(r, 900));
    const q = new URLSearchParams({ error: password ? '1' : 'config' });
    if (next !== '/') q.set('next', next);
    return seeOther(`/unlock?${q}`);
  }

  const res = seeOther(next);
  res.cookies.set(GATE_COOKIE, await gateToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GATE_MAX_AGE,
  });
  return res;
}

/**
 * A relative redirect: the browser resolves it against the host it actually
 * used, so the cookie and the page it lands on are always on the same host —
 * behind a proxy, on a preview URL, or on 127.0.0.1.
 */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
