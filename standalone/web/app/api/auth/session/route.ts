import { NextResponse } from 'next/server';
import { getSession, isSessionLive } from '@/lib/session';

/**
 * Returns the current authenticated user (or null). Backs the client
 * `getSession()` used to hydrate `useCurrentUser` on the client where needed.
 * Never exposes tokens.
 */
export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionLive(session)) {
    return NextResponse.json({ data: null });
  }
  return NextResponse.json({ data: session.user });
}

export const dynamic = 'force-dynamic';
