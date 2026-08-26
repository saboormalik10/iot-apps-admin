import { NextResponse, type NextRequest } from 'next/server';
import { backendJson } from '@/lib/bff/backend';
import { establishSession } from '@/lib/bff/auth';
import { isCsrfSafe } from '@/lib/bff/csrf';
import { getSession, isSessionLive } from '@/lib/session';
import type { AuthResult } from '@/lib/api/types';

/**
 * BFF organisation switch for a platform administrator.
 *
 * The backend returns a COMPLETE new session — access token, refresh token and
 * user — because switching re-points the token's `organizationId` and revokes
 * the refresh token it was given. So this replaces the stored session wholesale
 * rather than patching the access token, which is what keeps a later refresh
 * from reverting to the administrator's own organisation.
 *
 * The browser never sees either token; it gets `{ user }` back, exactly like login.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCsrfSafe(request)) {
    return NextResponse.json({ error: { code: 'CSRF_REJECTED', message: 'Rejected' } }, { status: 403 });
  }

  const session = await getSession();
  if (!isSessionLive(session)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, { status: 401 });
  }

  const { organizationId } = (await request.json().catch(() => ({}))) as { organizationId?: string | null };

  const { res, body: data } = await backendJson<{ data: AuthResult; error?: unknown }>('/auth/switch-org', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessToken}` },
    // The refresh token is sent from the session, never from the browser.
    body: JSON.stringify({ organizationId: organizationId ?? null, refreshToken: session.refreshToken }),
  });

  if (!res.ok || !data?.data) {
    return NextResponse.json(data ?? { error: { code: 'SWITCH_FAILED', message: 'Could not switch' } }, {
      status: res.status,
    });
  }

  await establishSession(data.data);
  return NextResponse.json({ data: { user: data.data.user } });
}
