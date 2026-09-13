import { NextResponse, after, type NextRequest } from 'next/server';
import { backendFetch } from '@/lib/bff/backend';
import { getSession } from '@/lib/session';
import { isCsrfSafe } from '@/lib/bff/csrf';

/**
 * Logout: destroy the local session, then revoke the refresh token upstream.
 *
 * THE ORDER IS THE POINT. This used to `await` the backend call before clearing
 * the cookie, so signing out took as long as a round trip to Render and Atlas —
 * measured at 4.8 seconds — while the user sat looking at a page they had just
 * asked to leave. The route's own comment called the backend call "best-effort";
 * awaiting it made it anything but.
 *
 * Clearing the cookie is what actually signs someone out of this browser, and it
 * is local and instant. The revocation still matters — it is what invalidates
 * the refresh token everywhere else — so it is not dropped, just moved off the
 * path the user waits on.
 *
 * `after()` runs the callback once the response has been sent, and is the reason
 * this is safe on a serverless host: a bare un-awaited promise can be killed the
 * moment the function returns, which would silently stop revoking anything.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }

  const session = await getSession();
  const refreshToken = session.refreshToken;
  const accessToken = session.accessToken;

  // Destroy FIRST: the response carries the cleared cookie either way, and
  // nothing below is allowed to delay or prevent it.
  session.destroy();

  if (refreshToken) {
    after(async () => {
      try {
        await backendFetch(
          '/auth/logout',
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) },
          accessToken,
        );
      } catch {
        // Ignored, as before. The local session is already gone; a failed
        // revocation leaves a refresh token that expires on its own, and there
        // is nobody left on this request to report it to.
      }
    });
  }

  return NextResponse.json({ data: { ok: true } });
}
