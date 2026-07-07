import 'server-only';

/**
 * Server-only environment. Importing this from a client component is a build
 * error (the `server-only` guard) — that's deliberate: BACKEND_URL and
 * SESSION_SECRET must never reach the browser bundle. Browser-visible config
 * lives in `public-env.ts`.
 */

// A 32+ char dev fallback so `yarn build` / local dev work without a real secret.
// Production MUST set SESSION_SECRET (enforced below).
const DEV_SESSION_SECRET = 'dev_only_insecure_session_secret_change_me_please';

function readSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set (≥32 chars) in production');
  }
  return DEV_SESSION_SECRET;
}

export const serverEnv = {
  /** Backend origin including the /v1 prefix — the BFF proxy target. */
  backendUrl: (process.env.BACKEND_URL ?? 'http://localhost:3000/v1').replace(/\/$/, ''),
  sessionSecret: readSessionSecret(),
  /** Idle-session timeout in minutes (session is cleared after this inactivity). */
  sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES ?? '30'),
  isProd: process.env.NODE_ENV === 'production',
};
