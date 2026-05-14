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

export function verifyAccessToken(token: string): JWTPayload {
  return jwt.verify(token, ACCESS_SECRET) as JWTPayload;
}

export function verifyRefreshToken(token: string): JWTPayload {
  return jwt.verify(token, REFRESH_SECRET) as JWTPayload;
}
