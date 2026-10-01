/**
 * The private-preview gate — not part of the portal design.
 *
 * The prototype is hosted (Vercel) and shows live-looking readings for a named
 * rail corridor, so nothing is served until the browser has been unlocked with
 * the preview password. Unlocking sets a long-lived cookie, so a browser that has
 * been let in once stays in: a reviewer is asked once per machine, not per visit.
 *
 * The cookie never holds the password. It holds an HMAC of a fixed label keyed by
 * the password, so it cannot be forged without knowing the password, and changing
 * SITE_PASSWORD locks every browser out at once. Web Crypto only, so the same code
 * runs in the middleware (edge) and the route handler (node).
 */

export const GATE_COOKIE = 'mts_preview';
/** 90 days: "easy to access after the password", without being forever. */
export const GATE_MAX_AGE = 90 * 24 * 60 * 60;

export function sitePassword(): string | undefined {
  const p = process.env.SITE_PASSWORD;
  return p && p.trim() ? p : undefined;
}

export async function gateToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('mts-preview-gate:v1'));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison, so a wrong guess takes as long as a nearly right one. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Only ever send someone back to a path on this site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/unlock')) return '/';
  return next;
}
