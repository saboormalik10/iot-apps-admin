import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch } from '@/lib/bff/backend';
import { getSession } from '@/lib/session';
import { isCsrfSafe } from '@/lib/bff/csrf';

/**
 * Logout: revoke the refresh token server-side (invalidates "everywhere") then
 * destroy the local session cookie. Best-effort backend call — the session is
 * always cleared regardless.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }

  const session = await getSession();
  const refreshToken = session.refreshToken;
  const accessToken = session.accessToken;

  if (refreshToken) {
    try {
      await backendFetch(
        '/auth/logout',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) },
        accessToken,
      );
    } catch {
      // ignore — we still clear the local session
    }
  }

  session.destroy();
  return NextResponse.json({ data: { ok: true } });
}
