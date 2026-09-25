import { NextResponse, type NextRequest } from 'next/server';
import { backendJson } from '@/lib/bff/backend';
import { establishSession } from '@/lib/bff/auth';
import { isCsrfSafe } from '@/lib/bff/csrf';
import type { AuthResult } from '@/lib/api/types';

/**
 * BFF login. Proxies POST /v1/auth/login, stores the tokens in the encrypted
 * session cookie, and returns only `{ user }`. Forwards the backend's 429
 * (login is throttled 10/60s) + Retry-After so the form can back off.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }

  const body = await request.text();
  const { res, body: data } = await backendJson<{ data: AuthResult; error?: unknown }>('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  if (!res.ok || !data?.data) {
    const out = NextResponse.json(data ?? { error: { code: 'LOGIN_FAILED', message: 'Login failed' } }, {
      status: res.status,
    });
    const retryAfter = res.headers.get('retry-after');
    if (retryAfter) out.headers.set('retry-after', retryAfter);
    return out;
  }

  await establishSession(data.data);
  return NextResponse.json({ data: { user: data.data.user } });
}
