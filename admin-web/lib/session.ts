import 'server-only';
import { cookies } from 'next/headers';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { serverEnv } from './config/env';
import type { SessionUser } from './api/types';

/**
 * Encrypted session cookie on the WEB origin (iron-session). Holds the backend
 * tokens server-side so the browser never sees them. SameSite=Lax (not Strict):
 * reset-password / accept-invite arrive as top-level GET navigations from email
 * and must carry the session.
 */
export interface SessionData {
  user?: SessionUser;
  accessToken?: string;
  refreshToken?: string;
  /** epoch ms of last activity — drives the idle-session timeout. */
  lastActiveAt?: number;
}

export const sessionOptions: SessionOptions = {
  password: serverEnv.sessionSecret,
  cookieName: 'obs_admin_session',
  cookieOptions: {
    httpOnly: true,
    secure: serverEnv.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7-day absolute cap
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

const idleMs = () => serverEnv.sessionIdleMinutes * 60 * 1000;

/** True if the session has an authenticated user that hasn't idled out. */
export function isSessionLive(session: SessionData): boolean {
  if (!session.accessToken || !session.refreshToken || !session.user) return false;
  if (session.lastActiveAt && Date.now() - session.lastActiveAt > idleMs()) return false;
  return true;
}

/** Stamp activity so the idle window slides forward. */
export function touchSession(session: SessionData): void {
  session.lastActiveAt = Date.now();
}

export async function clearSession(session: IronSession<SessionData>): Promise<void> {
  session.destroy();
}
