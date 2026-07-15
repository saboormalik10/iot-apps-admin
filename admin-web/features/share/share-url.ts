/**
 * Build the panel's OWN public share URL. The backend `ShareToken.url` points at
 * the API origin (`…/public/:token`), but the human-facing read-only view lives on
 * the admin web origin at `/s/:token` — so the copy-paste link is always built
 * client-side from the current origin, never from the backend field.
 */
export function publicShareUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/s/${token}`;
}
