import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';

/**
 * JWT authentication middleware.
 * Reads Bearer token from Authorization header, verifies it, and attaches
 * the decoded payload to req.user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Access token is invalid or expired' } });
  }
}

/**
 * Accepts EITHER a valid JWT (admin panel / user) OR the static mobile API key.
 * When the mobile key is used, req.user is populated from MOBILE_ORG_ID env var.
 * Use this on endpoints that mobile apps call directly.
 */
export function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } });
    return;
  }

  const token = authHeader.slice(7);
  const mobileKey = process.env.MOBILE_API_KEY;
  const mobileOrgId = process.env.MOBILE_ORG_ID;

  // Static mobile API key path
  if (mobileKey && token === mobileKey) {
    if (!mobileOrgId) {
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'MOBILE_ORG_ID not configured' } });
      return;
    }
    req.user = { userId: 'mobile-device', organizationId: mobileOrgId, role: 'member' } as JWTPayload;
    next();
    return;
  }

  // JWT path (admin panel)
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Access token is invalid or expired' } });
  }
}

/**
 * Role-based authorization middleware.
 * Must be used AFTER requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: `Requires role: ${roles.join(' or ')}` } });
      return;
    }
    next();
  };
}
