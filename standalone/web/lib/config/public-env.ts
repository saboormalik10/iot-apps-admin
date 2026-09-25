/**
 * Browser-visible config. Only NEXT_PUBLIC_* vars are inlined into the client
 * bundle by Next — reference the literal `process.env.NEXT_PUBLIC_*` so the
 * static replacement fires. No secrets here, ever.
 */
export const publicEnv = {
  featureFlags: process.env.NEXT_PUBLIC_FEATURE_FLAGS ?? '',
};
