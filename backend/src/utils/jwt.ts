import jwt from 'jsonwebtoken';

export interface JWTPayload {
  userId: string;
  /**
   * The organisation this request acts in.
   *
   * For a super admin who has switched, this is the CUSTOMER's id, not their own
   * — deliberately, so every existing `organizationId` filter keeps working
   * untouched. Switching re-points this field; it never bypasses the filter.
   */
  organizationId: string;
  /** Legacy role key. Still read by RolesGuard and the frontend Role union. */
  role: string;
  email?: string;
  /**
   * Resolved permission grants, carried so a guard need not hit the database on
   * every request.
   *
   * The cost is staleness: a 15-minute token means a permission change takes up
   * to 15 minutes to bite. That is acceptable for ordinary grants and NOT for
   * the destructive ones — `role:delete` and `station:provision` are re-read from
   * the database at the point of use (see PermissionsGuard).
   *
   * Optional: tokens minted before this shipped carry none, and the guard falls
   * back to deriving them from `role`.
   */
  perms?: string[];
  /** Platform-wide administrator. Bypasses permission checks, not org scoping. */
  sup?: boolean;
  /**
   * The super admin's OWN organisation, present only while they are switched
   * into another. Drives the "acting as" banner and lets them switch back.
   */
  homeOrganizationId?: string;
  iat?: number;
  exp?: number;
}

/**
 * Token signing secrets (M24 W1).
 *
 * These used to fall back to the literals `'fallback_access_secret'` and
 * `'fallback_refresh_secret'` when the environment variables were missing. Those
 * strings are IN THIS REPOSITORY, so a production deploy that simply forgot a
 * variable would sign real tokens with a publicly known key — and anyone able to
 * read the source could forge one, including `sup: true`, for any organisation.
 * Nothing would look wrong: logins would succeed and tokens would verify.
 *
 * So: refuse to start in production. A missing secret is a deployment error, and
 * the only safe way to surface it is loudly and immediately.
 *
 * Outside production a generated per-process secret is used instead of a shared
 * literal. Tokens then stop working across a restart, which is mildly annoying
 * and exactly right — it makes the missing variable obvious in development
 * instead of letting a known-key habit form.
 */
const PLACEHOLDERS = new Set([
  'fallback_access_secret',
  'fallback_refresh_secret',
  'CHANGE_ME_LONG_RANDOM_STRING',
  'CHANGE_ME_ANOTHER_LONG_RANDOM_STRING',
]);

function requireSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = process.env[name];
  const unusable = !value || value.length < 32 || PLACEHOLDERS.has(value);

  if (!unusable) return value;

  const why = !value ? 'is not set' : PLACEHOLDERS.has(value) ? 'is still the placeholder value' : 'is shorter than 32 characters';

  if (process.env.NODE_ENV === 'production') {
    console.error(`❌ ${name} ${why}. Refusing to start — tokens would be forgeable.`);
    process.exit(1);
  }

  console.warn(`⚠️  ${name} ${why}. Using a random per-process secret; tokens will not survive a restart.`);
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  return require('node:crypto').randomBytes(48).toString('hex');
}

const ACCESS_SECRET = requireSecret('JWT_ACCESS_SECRET');
const REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET');

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
