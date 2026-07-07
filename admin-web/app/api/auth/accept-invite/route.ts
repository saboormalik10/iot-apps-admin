import { NextResponse, type NextRequest } from 'next/server';
import { backendJson } from '@/lib/bff/backend';
import { establishSession } from '@/lib/bff/auth';
import { isCsrfSafe } from '@/lib/bff/csrf';
import type { AuthResult } from '@/lib/api/types';

/**
 * Accept-invite auto-logins: POST /v1/organizations/accept-invite returns the
 * same { user, accessToken, refreshToken } as login → set the session exactly
 * like login. Body: { token, password }.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }

  const body = await request.text();
  const { res, body: data } = await backendJson<{ data: AuthResult; error?: unknown }>(
    '/organizations/accept-invite',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body },
  );

  if (!res.ok || !data?.data) {
    return NextResponse.json(data ?? { error: { code: 'INVITE_FAILED', message: 'Failed' } }, {
      status: res.status,
    });
  }

  await establishSession(data.data);
  return NextResponse.json({ data: { user: data.data.user } });
}
