import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { backendFetch } from './backend';
import { refreshAccessToken, RefreshFailedError } from './refresh';
import { isCsrfSafe } from './csrf';
import { getSession, isSessionLive, touchSession, type SessionData } from '../session';
import type { IronSession } from 'iron-session';

const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'cookie',
  'authorization',
  'content-length',
  'transfer-encoding',
  'keep-alive',
]);

/** Copy request headers through, stripping hop-by-hop + auth/cookie (we set our own). */
function forwardHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) out.set(key, value);
  });
  return out;
}

/** Pass a backend Response back to the browser, streaming the body unchanged. */
function passThrough(res: Response): NextResponse {
  const headers = new Headers();
  const ct = res.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const cd = res.headers.get('content-disposition');
  if (cd) headers.set('content-disposition', cd); // exports / file downloads
  headers.set('cache-control', 'no-store');
  return new NextResponse(res.body, { status: res.status, headers });
}

function sessionExpired(): NextResponse {
  return NextResponse.json(
    { error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' } },
    { status: 401 },
  );
}

/**
 * The generic pass-through every authenticated call rides on (plan §3.1):
 *  1. CSRF origin check on mutations.
 *  2. Read the encrypted session; reject if missing / idled out.
 *  3. Attach `Authorization: Bearer <access>` and forward to the backend.
 *  4. On a backend 401, silent-refresh ONCE (deduped) and retry.
 *  5. If refresh itself fails → destroy the session (hard logout), no loop.
 * Multipart streams through unchanged (body buffered once so a post-refresh
 * retry can replay it).
 */
export async function forwardToBackend(request: NextRequest, backendPath: string): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json(
      { error: { code: 'CSRF_REJECTED', message: 'Cross-origin request rejected' } },
      { status: 403 },
    );
  }

  const session = await getSession();
  if (!isSessionLive(session)) {
    session.destroy();
    return sessionExpired();
  }

  // Slide the idle window; save sparingly to cut cookie churn on read bursts.
  const now = Date.now();
  if (!session.lastActiveAt || now - session.lastActiveAt > 30_000) {
    touchSession(session);
    await session.save();
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const bodyBuf = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;
  const path = `${backendPath}${request.nextUrl.search}`;

  const attempt = (token: string): Promise<Response> =>
    backendFetch(path, { method, headers: forwardHeaders(request.headers), body: bodyBuf }, token);

  let res = await attempt(session.accessToken!);

  if (res.status === 401) {
    try {
      const newAccess = await refreshAccessToken(session.refreshToken!);
      session.accessToken = newAccess;
      await session.save();
      res = await attempt(newAccess);
    } catch (err) {
      if (err instanceof RefreshFailedError) {
        session.destroy();
        return sessionExpired();
      }
      throw err;
    }
  }

  return passThrough(res);
}

/** Convenience for explicit auth routes that need the raw session. */
export async function withSession<T>(fn: (session: IronSession<SessionData>) => Promise<T>): Promise<T> {
  const session = await getSession();
  return fn(session);
}
