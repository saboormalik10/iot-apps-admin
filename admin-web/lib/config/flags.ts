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
  | 'notifications'
  | 'share'
  | 'importExport'
  | 'commandPalette'
  | 'maps';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  // Month 8 ships the live dashboard home, the devices module, and the fleet map.
  // Later-month sections stay flagged off until their month lands.
  dashboardHome: true,
  devices: true,
  maps: true,
  // Month 10 lands the NEP sessions module (+ NEP analytics, GPS density, fleet rollups).
  sessions: true,
  // Month 9 lands the MET analytics suite + the records module.
  records: true,
  analytics: true,
  // Month 11 lands alerts, the notifications feed + token registry, and share links.
  alerts: true,
  notifications: true,
  share: true,
  // Month 12 lands the import wizard + batch export and the global command palette.
  importExport: true,
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
