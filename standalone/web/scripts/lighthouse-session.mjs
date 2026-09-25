#!/usr/bin/env node
/**
 * Mints a real BFF session cookie so Lighthouse can measure the pages that
 * actually matter (plan §Month 12 "Lighthouse budget met").
 *
 * Every heavy surface — the dashboard, sessions, analytics — is behind auth, so a
 * budget that only ever measured /login was measuring the one page with no charts
 * in it. Rather than script a browser login (an extra puppeteer dependency and a
 * flaky form interaction), this logs in through the BFF exactly as the browser
 * does and hands Lighthouse the resulting `obs_admin_session` cookie via
 * `extraHeaders`.
 *
 * Prints the cookie to stdout. Usage:
 *   COOKIE=$(node scripts/lighthouse-session.mjs)
 *   lhci autorun --collect.settings.extraHeaders="{\"Cookie\":\"$COOKIE\"}"
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.LHCI_BASE_URL ?? 'http://localhost:3001';
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@observator.com';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@1234';

const res = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    // The BFF's CSRF check requires the same signals the fetch client sends.
    'x-requested-with': 'fetch',
    origin: BASE,
  },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});

if (!res.ok) {
  const body = await res.text().catch(() => '');
  console.error(`Login failed (${res.status}) at ${BASE}: ${body}`);
  process.exit(1);
}

// `getSetCookie` keeps multiple Set-Cookie headers separate; a plain get() would
// join them on commas and corrupt the (comma-containing) cookie value.
const cookies = res.headers.getSetCookie?.() ?? [];
const session = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('obs_admin_session='));

if (!session) {
  console.error(`No obs_admin_session cookie in the login response. Got: ${cookies.join(' | ') || '(none)'}`);
  process.exit(1);
}

process.stdout.write(session);
