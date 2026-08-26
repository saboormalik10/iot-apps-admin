import 'server-only';
import type { SessionUser } from '../api/types';

/**
 * Read the `perms` / `sup` claims the backend signs into the access token.
 *
 * The signature is NOT verified here, and deliberately so: this runs server-side
 * on a token we just received from our own backend over TLS, and the claims are
 * used only to decide what the UI offers. Every request is re-authorised by
 * `PermissionsGuard` against live state, so a forged claim would buy a prettier
 * button and a 403 — never access.
 */
export function claimsFromAccessToken(token: string | undefined): {
  permissions: string[];
  isSuperAdmin: boolean;
  homeOrganizationId: string | null;
} {
  const empty = { permissions: [], isSuperAdmin: false, homeOrganizationId: null };
  const payload = token?.split('.')[1];
  if (!payload) return empty;

  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const claims = JSON.parse(json) as { perms?: unknown; sup?: unknown; homeOrganizationId?: unknown };
    return {
      permissions: Array.isArray(claims.perms) ? claims.perms.filter((p): p is string => typeof p === 'string') : [],
      isSuperAdmin: claims.sup === true,
      // Present only while switched into another organisation — it is what tells
      // the UI to show the "acting as" banner.
      homeOrganizationId:
        typeof claims.homeOrganizationId === 'string' ? claims.homeOrganizationId : null,
    };
  } catch {
    // A malformed token is the proxy's problem, not ours — degrade to the legacy
    // role matrix rather than throwing a user out of a working session.
    return empty;
  }
}

/** `user` with the token's grants attached, for the RBAC context to read. */
export function withClaims(user: SessionUser, token: string | undefined): SessionUser {
  return { ...user, ...claimsFromAccessToken(token) };
}
