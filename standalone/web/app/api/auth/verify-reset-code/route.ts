import { NextResponse, type NextRequest } from 'next/server';
import { backendJson } from '@/lib/bff/backend';
import { isCsrfSafe } from '@/lib/bff/csrf';

/**
 * Verify-reset-code: proxy POST /v1/auth/verify-reset-code. Body: { email, code }.
 * On success the backend returns { data: { resetToken } }; we forward it so the
 * page can pass the single-use resetToken to /auth/reset-password. (The resetToken
 * is not an auth credential — it only lets the holder set THIS account's password,
 * exactly like the old email-link token, so it's fine for the browser to hold it
 * transiently.) A 400 (wrong/expired code, too many attempts) is forwarded as-is.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }

  const body = await request.text();
  const { res, body: data } = await backendJson<unknown>('/auth/verify-reset-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  return NextResponse.json(data ?? { error: { code: 'VERIFY_FAILED', message: 'Failed' } }, {
    status: res.status,
  });
}
