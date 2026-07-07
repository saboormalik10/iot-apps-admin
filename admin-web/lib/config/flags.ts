import { publicEnv } from './public-env';

/**
 * Feature-flag seam (plan §15). Established in Month 7, used from Month 8 to gate
 * half-built surfaces. In Month 7 every later-month nav section is OFF, so the
 * shell renders without dead links. Force-enable in any env by listing the key in
 * NEXT_PUBLIC_FEATURE_FLAGS (comma-separated).
 */
export type FeatureFlag =
  | 'dashboardHome'
  | 'devices'
  | 'sessions'
  | 'records'
  | 'analytics'
  | 'alerts'
  | 'reports'
  | 'commandPalette'
  | 'maps';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  // Month 7 ships org/people/audit/profile + the shell only. Everything below
  // lands Month 8–12 and stays flagged off until then.
  dashboardHome: false,
  devices: false,
  sessions: false,
  records: false,
  analytics: false,
  alerts: false,
  reports: false,
  commandPalette: false,
  maps: false,
};

function forcedFlags(): Set<string> {
  return new Set(
    publicEnv.featureFlags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  if (forcedFlags().has(flag)) return true;
  return DEFAULTS[flag] ?? false;
}
