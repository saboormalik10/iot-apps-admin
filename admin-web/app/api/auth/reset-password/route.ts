import { NextResponse, type NextRequest } from 'next/server';
import { backendJson } from '@/lib/bff/backend';
import { isCsrfSafe } from '@/lib/bff/csrf';

/**
 * Reset-password: proxy POST /v1/auth/reset-password. Body: { resetToken, newPassword }
 * (the resetToken comes from /auth/verify-reset-code). The backend returns 400/401
 * for a dead (expired/used) token → forwarded so the page can show an error state.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }

  const body = await request.text();
  const { res, body: data } = await backendJson<unknown>('/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

  if (res.status === 204 || res.ok) return NextResponse.json({ data: { ok: true } });
  return NextResponse.json(data ?? { error: { code: 'RESET_FAILED', message: 'Failed' } }, {
    status: res.status,
  });
}
