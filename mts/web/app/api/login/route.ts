import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE, safeEqual, safeNext, sessionToken, siteAccounts } from '@/lib/gate';

/**
 * Sign in. A plain form post, so it works before any script has loaded.
 *
 * Order matters: the Cloudflare check is verified first (when a secret key is
 * configured), so a bot never gets as far as having a password compared.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? '/'));
  const remember = form.get('remember') === 'on';
  const accounts = siteAccounts();

  const fail = async (error: string) => {
    // Slow every failure down; there is no lockout counter to keep without a database.
    await new Promise((r) => setTimeout(r, 900));
    const q = new URLSearchParams({ error });
    if (next !== '/') q.set('next', next);
    if (email) q.set('email', email);
    return seeOther(`/login?${q}`);
  };

  if (accounts.length === 0) return fail('config');
  if (!(await humanCheck(String(form.get('cf-turnstile-response') ?? ''), req))) return fail('human');

  // Every account is compared, so a wrong guess takes as long whichever it was meant for.
  const given = await sessionToken(email, password);
  let token: string | undefined;
  for (const a of accounts) {
    const t = await sessionToken(a.email, a.password);
    if (safeEqual(given, t)) token = t;
  }
  if (!token) return fail('credentials');

  const res = seeOther(next);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(remember ? { maxAge: SESSION_MAX_AGE } : {}),
  });
  return res;
}

/**
 * Cloudflare Turnstile, verified on the server. Without TURNSTILE_SECRET_KEY the
 * page runs on Cloudflare's test key and there is nothing real to verify, so the
 * check is skipped rather than faked.
 */
async function humanCheck(token: string, req: NextRequest): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0];
    if (ip) body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const j = (await r.json()) as { success?: boolean };
    return Boolean(j.success);
  } catch {
    return false;
  }
}

/** Relative, so the cookie and the page it lands on are always on the host the browser used. */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
