/**
 * Browser-visible config. Only NEXT_PUBLIC_* vars are inlined into the client
 * bundle by Next — reference the literal `process.env.NEXT_PUBLIC_*` so the
 * static replacement fires. No secrets here, ever.
 */
export const publicEnv = {
  /** wss://…backend origin — the socket connects from the browser to /v1/ws. */
  wsUrl: process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? 'ws://localhost:3000',
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  featureFlags: process.env.NEXT_PUBLIC_FEATURE_FLAGS ?? '',
};
