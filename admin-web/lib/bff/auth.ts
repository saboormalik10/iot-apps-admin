import 'server-only';
import { getSession } from '../session';
import type { AuthResult } from '../api/types';
import { withClaims } from './claims';

/**
 * Store a backend AuthResult (login / accept-invite) into the encrypted session
 * cookie. The tokens stay server-side; only `{ user }` is ever returned to the
 * browser.
 */
export async function establishSession(auth: AuthResult): Promise<void> {
  const session = await getSession();
  session.user = withClaims(auth.user, auth.accessToken);
  session.accessToken = auth.accessToken;
  session.refreshToken = auth.refreshToken;
  session.lastActiveAt = Date.now();
  await session.save();
}
