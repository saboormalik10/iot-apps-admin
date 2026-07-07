import jwt from 'jsonwebtoken';

export interface JWTPayload {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
  iat?: number;
  exp?: number;
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'fallback_access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'fallback_refresh_secret';

export function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

/**
 * Short-TTL (~60s) access token minted for the socket.io handshake under the BFF
 * model, so the long-lived 15m access token never reaches the browser. Signed on
 * the SAME `ACCESS_SECRET`, so the realtime gateway's `verifyAccessToken` accepts
 * it with no gateway change. Deliberately separate from `signAccessToken` (which
 * hardcodes 15m) rather than parameterising it.
 */
export function signWsTicket(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '60s' });
}

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, ACCESS_SECRET) as JWTPayload;
}

export function verifyRefreshToken(token: string): JWTPayload {
  return jwt.verify(token, REFRESH_SECRET) as JWTPayload;
}
