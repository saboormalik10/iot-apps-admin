/**
 * Sign-in for the hosted portal.
 *
 * One account, configured on the server: SITE_EMAIL and SITE_PASSWORD (in
 * .env.local locally, in Vercel's environment variables when deployed). Every
 * route needs a signed-in session; signing out ends it, and the next visit asks
 * for the email and password again.
 *
 * The session cookie never holds the password. It holds an HMAC of a fixed label
 * keyed by the email and password together, so it cannot be forged without them,
 * and changing either signs every browser out. Web Crypto only, so the same code
 * runs in the middleware (edge) and the route handlers (node).
 */

export const SESSION_COOKIE = 'mts_session';
/** "Keep me signed in": 30 days. Otherwise the session ends with the browser. */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/** Pages anyone may open: signing in, and getting back in if the password is forgotten. */
export const PUBLIC_PATHS = ['/login', '/api/login', '/forgot-password', '/reset-password', '/locked', '/accept-invite'];

export function siteAccount(): { email: string; password: string } | undefined {
  const email = process.env.SITE_EMAIL?.trim().toLowerCase();
  const password = process.env.SITE_PASSWORD;
  return email && password && password.trim() ? { email, password } : undefined;
}

export async function sessionToken(email: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(`${email.trim().toLowerCase()}\n${password}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('mts-portal-session:v1'));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison, so a wrong guess takes as long as a nearly right one. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Only ever send someone back to a path on this site, and never back to sign-in. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/login') || next.startsWith('/api/')) return '/';
  return next;
}
