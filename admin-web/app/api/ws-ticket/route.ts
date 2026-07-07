import { NextResponse, type NextRequest } from 'next/server';
import { backendJson } from '@/lib/bff/backend';
import { refreshAccessToken, RefreshFailedError } from '@/lib/bff/refresh';
import { isCsrfSafe } from '@/lib/bff/csrf';
import { getSession, isSessionLive, touchSession } from '@/lib/session';

/**
 * Mints a short-lived WS ticket for the socket handshake (PR5 → Part A1). Calls
 * POST /v1/auth/ws-ticket with the session's access token, silent-refreshing it
 * first if the 15m token has expired (that endpoint is JWT-guarded). The browser
 * fetches a FRESH ticket before every connect/reconnect (the ticket lives ~60s).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }

  const session = await getSession();
  if (!isSessionLive(session)) {
    session.destroy();
    return NextResponse.json(
      { error: { code: 'SESSION_EXPIRED', message: 'Not authenticated' } },
      { status: 401 },
    );
  }
  touchSession(session);
  await session.save();

  const call = (token: string) =>
    backendJson<{ data: { ticket: string; expiresInSec: number } }>(
      '/auth/ws-ticket',
      { method: 'POST' },
      token,
    );

  let { res, body } = await call(session.accessToken!);

  if (res.status === 401) {
    try {
      const newAccess = await refreshAccessToken(session.refreshToken!);
      session.accessToken = newAccess;
      await session.save();
      ({ res, body } = await call(newAccess));
    } catch (err) {
      if (err instanceof RefreshFailedError) {
        session.destroy();
        return NextResponse.json(
          { error: { code: 'SESSION_EXPIRED', message: 'Session expired' } },
          { status: 401 },
        );
      }
      throw err;
    }
  }

  if (!res.ok || !body?.data) {
    return NextResponse.json(
      { error: { code: 'WS_TICKET_FAILED', message: 'Could not mint a WS ticket' } },
      { status: res.status || 502 },
    );
  }

  return NextResponse.json({ data: body.data });
}
