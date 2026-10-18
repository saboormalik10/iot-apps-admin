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
  | 'records'
  | 'analytics'
  | 'alerts'
  | 'notifications'
  | 'commandPalette';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  dashboardHome: true,
  devices: true,
  records: true,
  analytics: true,
  // Switched off at the client's request (10 Oct 2026): "Disable - Alerts &
  // Notifications". The pages, the menu entries and the bell go; the backend
  // stops evaluating rules unless ALERTS_ENABLED=true.
  alerts: false,
  notifications: false,
  commandPalette: true,
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
