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
  /**
   * Fleet map + GPS density — OFF.
   *
   * The map only plots stations that report a GPS position, and the SFTP files
   * carry none. Verified against the live upload folder: every stream is
   * timestamp + sensor values only —
   *   WindSonic      timestamp, direction, speed, units, status
   *   Environmental  timestamp, temperature_C, humidity_percent, pressure_hPa
   *   EnvDiagnostic  timestamp, received_time_ms, second, status, sentence, reason
   * — so `getFleetMap` drops every station on its `lastGpsLat == null` guard and
   * the screen can only ever be blank. GPS came from the mobile apps, which are
   * disabled; a WindSonic mast is bolted in one place and never reports where.
   *
   * To bring it back, store a fixed latitude/longitude on the station at
   * provisioning time and plot that instead of a reading's GPS fix. That is also
   * the "corridor map" the Sydney Metro proposal commits to, so the work carries.
   */
  maps: false,
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
  // Stays OFF: `POST /organizations/me/users/invite` is commented out on the
  // backend (no invitation email in this deployment), so flipping this on would
  // render a dialog that 404s. Adding a person now goes through AddUserDialog and
  // `POST /organizations/me/users`. Reviving invitations means uncommenting the
  // route, its DTO and the mailer wiring first.
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
