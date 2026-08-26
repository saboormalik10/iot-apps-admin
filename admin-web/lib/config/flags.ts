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
  | 'userInvites'
  | 'nepAnalytics'
  | 'maps';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  // Month 8 ships the live dashboard home, the devices module, and the fleet map.
  // Later-month sections stay flagged off until their month lands.
  dashboardHome: true,
  devices: true,
  maps: true,
  // Month 10 lands the NEP sessions module (+ NEP analytics, GPS density, fleet rollups).
  // NEP is switched off (M15 W4). Its only data source was the mobile apps, which
  // are disabled, so sessions and NEP analytics have a fixed dataset that can
  // never grow. The screens stay in the codebase for M22, when water quality is
  // onboarded as an SFTP stream type.
  sessions: false,
  nepAnalytics: false,
  // Month 9 lands the MET analytics suite + the records module.
  records: true,
  analytics: true,
  // Re-enabled in M17: the wind alarm is a product the client sells, and the SFTP
  // ingest emits MET_MEASURES, which the backend evaluator listens to.
  alerts: true,
  notifications: true,
  share: true,
  // Month 12 lands the import wizard + batch export and the global command palette.
  importExport: true,
  commandPalette: true,
  // Email invitations are switched off (M15 W3): the backend routes
  // `POST /organizations/me/users/invite` and `POST /organizations/accept-invite`
  // are commented out. Customer logins are created directly by the super admin —
  // that flow lands in M19 W4 and replaces this UI rather than re-enabling it.
  userInvites: false,
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
