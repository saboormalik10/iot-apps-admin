/**
 * Domain types for the Month-7 API surface. Hand-authored from the backend
 * Swagger (audience: 🖥️ Admin Panel). The CI `check-contract` script asserts the
 * paths/methods the client depends on still exist in the live spec (drift check),
 * so these types can't silently rot against the backend.
 */

export type Role = 'admin' | 'operator' | 'viewer';

/** Compact user identity returned by login. */
export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string;
  /**
   * Grants from the access token, refreshed with it. Present from M18 W2 on;
   * optional because a session cookie minted before that carries neither, and
   * those users must keep working until their next refresh.
   */
  permissions?: string[];
  isSuperAdmin?: boolean;
  /**
   * The platform administrator's OWN organisation, set only while they are
   * acting inside a customer's. Its presence is what raises the banner.
   */
  homeOrganizationId?: string | null;
  /** An administrator set this password: the portal asks for a new one before anything else. */
  mustChangePassword?: boolean;
}

/** Full profile — GET/PATCH /users/me. */
export interface Profile extends SessionUser {
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Org member row — GET /organizations/me/users (returned as a full array). */
export interface OrgUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /**
   * The LEGACY key. For someone holding a custom role this is that role's
   * `baseRole`, not its name — read `roleId` to know which role they actually
   * hold, and look it up in the roles list for a label.
   */
  role: Role;
  roleId?: string | null;
  /** The name of the role held (custom roles included); null only for a role that is gone. */
  roleName?: string | null;
  isActive: boolean;
  /** Signed themselves up and waiting for an administrator to approve them. */
  pendingApproval?: boolean;
  /** An administrator set the password and the user has not yet chosen their own. */
  mustChangePassword?: boolean;
  lastLoginAt: string | null;
}

/** GET/PATCH /organizations/me. */
export interface Organization {
  id: string;
  name: string;
  slug?: string;
  contactEmail?: string;
  country: string;
  timezone: string;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'invite'
  | 'revoke'
  | 'export'
  | 'login'
  | 'logout';

export type AuditResourceType =
  | 'device'
  | 'user'
  | 'session'
  | 'record'
  | 'alertRule'
  | 'shareToken'
  | 'organization'
  | 'settings';

export interface AuditEntry {
  _id: string;
  userEmail: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  resourceName: string | null;
  changes: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

export type NotificationKind = 'alert';

export interface AppNotification {
  _id: string;
  type: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/** Login response body (before the BFF strips the tokens). */
export interface AuthResult {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

// ─── Month 8: Dashboard ──────────────────────────────────────────────────────

export type DeviceType = 'MET-LINK' | 'NEP-LINK';

/** GET /dashboard/summary (+ §10.8 enrichment). */
export interface DashboardSummary {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  metLinkDevices: number;
  /** Total MET READINGS (sum of per-day `measureCount`), not day-records. */
  totalMetRecords: number;
  /** How many local days those readings span. */
  totalMetDays?: number;
  /** §10.8 — count of armed (isActive) alert rules. */
  activeAlertRules: number;
  /** §10.8 — last-14-day daily counts, oldest→newest. */
  sparklines: { records: number[] };
  serverTime: string;
  /**
   * True when the reading/day figures were counted inside the scope-bar window.
   * Device, online and armed-rule counts are current state either way — the UI
   * says so rather than letting them look like they ignored the filter.
   */
  windowed?: boolean;
}

/** `magnetic`: the GMX551's compass-corrected bearing. `mast`: its own north marker. */
export type WindDirReference = 'magnetic' | 'mast' | null;

/** GET /dashboard/devices — one row per device with live-ish status. */
export interface DashboardDevice {
  /** Sensors this device actually reports; empty when it has not ingested yet. */
  availableSensors?: string[];
  headingOffsetDeg?: number;
  _id: string;
  name: string;
  bleId: string;
  type: DeviceType;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  lastBatteryPct: number | null;
  lastBatteryCharging: boolean | null;
}

/** GET /dashboard/met/latest — all-sensor snapshot (any field may be null). */
export interface MetLatest {
  /** Mast heading offset in degrees; 0 means the bearing is relative, not true. */
  headingOffsetDeg: number;
  /** What the bearing is measured from while no offset is set: the compass, or the mast. */
  windDirReference?: WindDirReference;
  recordId: string;
  deviceName: string;
  measuredAtMs: number;
  windSpeedMs: number | null;
  windSpeedKmh: number | null;
  windSpeedKnots: number | null;
  windDirTrueDeg: number | null;
  windDirRelDeg: number | null;
  tempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  dewPointC: number | null;
  precipMm: number | null;
  /** Precipitation intensity (mm/h). Returned by the API (dashboard.service.ts) but was missing here. */
  precipRateMmHr: number | null;
  solarWm2: number | null;
  qnhHpa: number | null;
  qfeHpa: number | null;
  voltageV: number | null;
  batteryVoltageV: number | null;
  currentA: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAltM: number | null;
}

/** GET /dashboard/met/windrose — pre-binned 16-sector × speed-band count matrices.
 *  Binning now happens server-side (§ graph-data contract): the browser receives
 *  one small matrix per orientation × period instead of up to 600 raw samples. */
export type WindMatrix = number[][];
export interface MetWindrose {
  recordId: string | null;
  /** Timestamp (ms) of the freshest sample the matrices were built from. */
  newestTsMs: number | null;
  /** Speed-band labels for the matrix columns (server SPEED_BANDS order). */
  bands: string[];
  matrices: {
    true: { '10m': WindMatrix; '2m': WindMatrix };
    relative: { '10m': WindMatrix; '2m': WindMatrix };
  };
}

/** GET /dashboard/met/history — adaptive-bucket min/avg/max series for one sensor. */
export interface MetHistoryPoint {
  timestampMs: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}
export interface MetHistory {
  sensor: string;
  unit: string;
  data: MetHistoryPoint[];
  /** Bucket width (ms) the backend chose for this window. */
  bucketMs?: number;
}

/** GET /dashboard/met/history-multi — every requested sensor in one payload,
 *  so the dashboard graph stack loads all charts with a single request. */
export interface MetHistorySeries {
  unit: string;
  data: MetHistoryPoint[];
}
export interface MetHistoryMulti {
  from: number;
  to: number;
  bucketMs: number;
  series: Record<string, MetHistorySeries>;
}

// ─── Month 8: Devices ────────────────────────────────────────────────────────

/** GET /devices/:id (+ list rows). */
export interface Device {
  /** Sensor keys this device has actually reported, maintained by the ingester. */
  availableSensors?: string[];
  sensorsUpdatedAt?: string | null;
  /** Mast heading offset; 0 means bearings are relative, not true. */
  headingOffsetDeg?: number;
  _id: string;
  bleId: string;
  name: string;
  customName: string | null;
  type: DeviceType;
  serialNo: string | null;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  lastBatteryPct: number | null;
  lastBatteryVoltage: number | null;
  lastBatteryCharging: boolean | null;
  isOnline: boolean;
  /**
   * Keep the raw per-second samples as well as the minute record.
   *
   * Off by default. The switch is for a "special circumstance" — commissioning a
   * site, or chasing a suspected sensor fault.
   */
  storeRawSamples?: boolean;
  /** Local hour the rain day starts, 0–23 (0 = midnight; 9 = the BOM rain day). */
  rainDayStartHour?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors `GET /devices/:id/health` after the M25 trim. `batteryPct`,
 * `batteryCharging`, `firmwareVersion`, `firmwareAgeDays` and `alertCount24h`
 * are gone: only the BLE heartbeat ever wrote them, so an ingest-fed station
 * served null for every one. `batteryVoltage` now comes from the ingested
 * `MetMeasure.batteryVoltageV` for MET-LINK stations.
 */
export interface DeviceHealth {
  deviceId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  batteryVoltage: number | null;
  lastSyncAt: string | null;
  lastSyncLagSeconds: number | null;
}

// `DeviceSettings` / `SensorPref` lived here for the device-settings editor, which
// was deleted in M25 — nothing in this portal read the values back. The backend
// still serves GET/PATCH /devices/:id/settings; re-add the types if a display
// layer ever consumes them.

// ── Analytics (Month 9 — MET deep-dive) ──────────────────────────────────────

/** GET /analytics/met/wind-rose — aggregated polar rose over the whole window. */
export interface WindRoseSector {
  dir: number;
  label: string;
  count: number;
  pct: number;
  avgSpeedMs: number;
  maxSpeedMs: number;
  avgSpeed: number;
  maxSpeed: number;
  speedBuckets: { label: string; count: number }[];
}
export interface MetWindRoseAgg {
  deviceId: string;
  from: number;
  to: number;
  period: string;
  unit: string;
  totalSamples: number;
  sectors: WindRoseSector[];
}

/** GET /analytics/met/multi-sensor — aligned small-multiples (no dual axis). */
export interface MetMultiSensorSeries {
  sensor: string;
  unit: string;
  values: Array<number | null>;
}
export interface MetMultiSensor {
  deviceId: string;
  from: number;
  to: number;
  interval: string;
  timestamps: number[];
  series: MetMultiSensorSeries[];
}

/** GET /analytics/met/statistics — descriptive profile (+ Beaufort for wind_speed). */
export interface BeaufortBreakdownRow {
  force: number;
  label: string;
  description: string;
  minMs: number;
  maxMs: number | null;
  count: number;
  pct: number;
  totalHrs: number;
}
export interface MetStatistics {
  sensor: string;
  unit: string;
  count: number;
  mean?: number | null;
  median?: number | null;
  stdDev?: number | null;
  variance?: number | null;
  p10?: number | null;
  p25?: number | null;
  p50?: number | null;
  p75?: number | null;
  p90?: number | null;
  p95?: number | null;
  p99?: number | null;
  min?: number | null;
  max?: number | null;
  range?: number | null;
  skewness?: number | null;
  beaufortBreakdown?: BeaufortBreakdownRow[];
}

/** GET /analytics/met/wind-gust-history. */
export interface MetGustPoint {
  ts: number;
  gustMs: number;
  gustKmh: number;
  gustKnots: number;
  dirDeg: number | null;
}
export interface MetWindGust {
  deviceId: string;
  interval: string;
  data: MetGustPoint[];
}

/**
 * GET /analytics/met/mean-wind — the WMO standard reported wind.
 *
 * `samples` matters: a "10-minute mean" built from four readings is not one,
 * and only the caller can decide whether that is good enough to show.
 */
export interface MetMeanWindPoint {
  ts: number;
  speedMs: number | null;
  /** Vector-averaged, so a north-crossing window reads north and not south. */
  dirDeg: number | null;
  samples: number;
}
export interface MetMeanWind {
  deviceId: string;
  /** Always 600000 — the WMO averaging period. */
  windowMs: number;
  data: MetMeanWindPoint[];
}

/** GET /analytics/met/comfort-indices. */
export interface MetComfortPoint {
  ts: number;
  tempC: number | null;
  humidityPct: number | null;
  windSpeedMs: number | null;
  heatIndexC: number | null;
  windChillC: number | null;
  effectiveTempC: number | null;
  comfortLabel: string;
}
export interface MetComfort {
  deviceId: string;
  interval: string;
  data: MetComfortPoint[];
}

/** GET /analytics/met/fog-risk. */
export interface MetFogPoint {
  ts: number;
  tempC: number;
  dewPointC: number;
  spread: number;
  fogRisk: 'HIGH' | 'MODERATE' | 'LOW';
  relativeHumidityPct: number | null;
}
export interface MetFogRisk {
  deviceId: string;
  interval: string;
  data: MetFogPoint[];
}

/** GET /analytics/met/pressure-tendency. */
export interface MetPressureTendency {
  deviceId: string;
  hours: number;
  current: number | null;
  previous: number | null;
  deltaHpa: number | null;
  deltaPerHr: number | null;
  tendency: string;
  label: string;
}

// ── Records (Month 9 — MET records) ──────────────────────────────────────────

/** GET /records — a MET logging record (list row + detail header). */
export interface MetRecordRow {
  _id: string;
  organizationId: string;
  deviceId: string;
  deviceName: string;
  urlMaps: string | null;
  dateStart: string;
  dateEnd: string | null;
  dateStartMs: number;
  dateEndMs: number | null;
  comment: string;
  measureCount: number;
  hasHeaderRow: boolean;
  createdAt: string;
  /**
   * The STATION's local calendar day this record groups (YYYY-MM-DD), fixed when
   * the data was written. It is not the viewer's day: a Sydney station's
   * 2026-09-08 begins at 7:00 PM on 2026-09-07 for a viewer in Karachi.
   */
  dayKey?: string | null;
  source?: 'stream' | 'sftp' | 'mobile' | null;
  /**
   * Readings inside the requested window, when one was given.
   *
   * A record spans a whole local day, so a narrower range still returns the
   * whole record — `measureCount` then describes the day, not the selection.
   * Absent when no window was requested.
   */
  measuresInRange?: number;
}

/** GET /records/:id/measures — one measure row (full measure set). */
export interface MetMeasureRow {
  _id: string;
  recordId: string;
  rowType: 'header' | 'data';
  dataSentence: string;
  timeStamp: string;
  timestampMs: number;
  windSpeedMs: number | null;
  windSpeedTrueMs: number | null;
  windSpeedRelMs: number | null;
  windDirTrueDeg: number | null;
  windDirRelDeg: number | null;
  /**
   * WMO gust for this minute: the peak 3-SECOND mean, computed at ingest.
   *
   * Computed there because it cannot be recovered later — a minute mean has
   * already smoothed away the very peak the gust is meant to capture.
   */
  windGustMs?: number | null;
  windGustDirDeg?: number | null;
  /** Rolling WMO means ending at this minute. */
  windSpeedMean2mMs?: number | null;
  windDir2mDeg?: number | null;
  windSpeedMean10mMs?: number | null;
  windDir10mDeg?: number | null;
  /** Per-second samples behind this minute — 60 is a full minute at 1 Hz. */
  windSampleCount?: number;
  /** Minutes present in the 10-minute window; under 10 means it is partial. */
  windMean10mMinutes?: number;
  /** `'1m'` for a one-minute record. Absent on readings stored before Sept 2026. */
  res?: '1m';
  tempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  precipMm: number | null;
  precipRateMmHr: number | null;
  solarWm2: number | null;
  voltageV: number | null;
  batteryVoltageV: number | null;
  currentA: number | null;
  dewPointC: number | null;
  qnhHpa: number | null;
  qfeHpa: number | null;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAltM: number | null;
  gpsSatellites: number | null;
  gpsHorDilution: number | null;
  gpsGeoidalSepM: number | null;
  gpsQuality: number | null;
  /**
   * QC codes for the fields this reading FAILED (WMO-No. 8 Part IV).
   *
   * Absent on a good reading. Present means those fields were nulled at ingest
   * and are excluded from every average, gust and rollup — the raw CSV line is
   * still in `dataSentence`, so nothing was thrown away.
   */
  qc?: string[];
}

/** GET /analytics/met/daily-summary (§10.7). */
export interface MetDailySummary {
  deviceId: string;
  organizationId: string;
  date: string;
  dateMs: number;
  windSpeedAvgMs: number | null;
  windSpeedMaxMs: number | null;
  windSpeedMaxAt: number | null;
  windDirPrevailing: number | null;
  windCalmPct: number | null;
  beaufortDistribution: number[];
  tempAvgC: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  tempMaxAt: number | null;
  tempMinAt: number | null;
  humidityAvgPct: number | null;
  humidityMaxPct: number | null;
  humidityMinPct: number | null;
  pressureAvgHpa: number | null;
  pressureMaxHpa: number | null;
  pressureMinHpa: number | null;
  pressureTendency: string | null;
  pressureTendencyHpaPerHr: number | null;
  precipTotalMm: number | null;
  precipRateMaxMmHr: number | null;
  precipRateAvgMmHr: number | null;
  solarMaxWm2: number | null;
  solarAvgWm2: number | null;
  solarDailyKwhM2: number | null;
  dewPointAvgC: number | null;
  dewPointSpreadAvg: number | null;
  sampleCount: number;
  expectedSamples: number;
  completenessPercent: number;
}

// ═══ Month 11: Alerts, Notifications, Dashboard presets ═══════════════════════

/** Alert-rule app family — NOTE: 'MET', not the DeviceType 'MET-LINK'. */
export type AlertAppType = 'MET';
export type AlertCondition = 'gt' | 'lt' | 'gte' | 'lte';

/** One entry of a rule's rolling trigger log (server caps at 50). */
export interface TriggerHistoryEntry {
  triggeredAt: string;
  /** The raw reading, in the SENSOR's stored unit (wind is m/s). */
  sensorValue: number;
  notifiedCount: number;
  /**
   * When the reading was MEASURED, as opposed to processed. Absent on entries
   * written before this was recorded — render those as "(processed)" rather
   * than implying the wind blew when the server happened to catch up.
   */
  measuredAtMs?: number | null;
  /** `sensorValue` converted into the rule's unit, by the server. */
  displayValue?: number | null;
  displayUnit?: string;
}

/** GET /alert-rules — a per-device+sensor threshold rule (list row + detail). */
/** Why one minute did — or did not — raise an alert. */
export type AlertMinuteReason =
  | 'fired'
  | 'cooldown'
  | 'not_crossed'
  /** Empty, but too recent to call missing — its file may still be arriving. */
  | 'pending'
  | 'no_data'
  | 'paused'
  | 'not_recorded';

export interface AlertTimelineBucket {
  /** Minute start, epoch ms. */
  ts: number;
  count: number;
  /** The value the evaluator would use, in the sensor's stored unit. */
  value: number | null;
  /** The same value in the RULE's unit — what the operator reads. */
  displayValue: number | null;
  displayAvg: number | null;
  breached: boolean;
  fired: boolean;
  reason: AlertMinuteReason;
}

export interface AlertTimeline {
  ruleId: string;
  deviceId: string;
  name: string;
  sensor: string;
  condition: AlertCondition;
  threshold: number;
  unit: string;
  storedUnit: string | null;
  thresholdStored: number;
  cooldownMinutes: number;
  isActive: boolean;
  from: number;
  to: number;
  minutes: number;
  supported: boolean;
  historyComplete: boolean;
  firesOnIngestTime?: number;
  buckets: AlertTimelineBucket[];
}

export interface AlertRule {
  _id: string;
  name: string;
  deviceId: string;
  appType: AlertAppType;
  sensor: string;
  condition: AlertCondition;
  threshold: number;
  unit: string;
  isActive: boolean;
  notifyUserIds: string[];
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
  triggerHistory: TriggerHistoryEntry[];
  createdAt: string;
  updatedAt?: string;
}

/** One tile of a saved dashboard preset (GET/POST /dashboard-layouts). Per-device. */
export interface DashboardTile {
  index: number;
  nmea: string;
  type: string;
  unit: string;
  desc: string;
  label: string;
}
export interface DashboardLayout {
  _id: string;
  userId: string;
  deviceId: string;
  organizationId: string;
  name: string;
  isDefault: boolean;
  tiles: DashboardTile[];
  createdAt: string;
  updatedAt: string;
}

/**
 * min / mean / max for one sensor over a window — the context shown beside the
 * live reading so the date filter visibly changes something.
 *
 * `min` is null for sensors whose daily rollup does not store one (wind,
 * precipitation rate, solar — all of which sit at zero for part of any window).
 * `basis` says whether it was computed from raw measures or daily rollups; the
 * rollup path is rounded outward to whole local days.
 */
export interface MetRangeSummary {
  sensor: string;
  unit: string;
  count: number;
  min: number | null;
  mean: number | null;
  max: number | null;
  basis: 'measures' | 'daily';
}

/** A role and how many people hold it (M18). */
export interface RoleRow {
  _id: string;
  organizationId: string | null;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  /** Which legacy key a holder is mirrored onto — needed by RolesGuard. */
  baseRole?: Role;
  isSystem: boolean;
  isDefault: boolean;
  userCount: number;
}

export interface PermissionGroup {
  group: string;
  permissions: { key: string; label: string }[];
}

/** A role offered as a replacement when deleting another. */
export interface RoleReplacement {
  _id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
}

export interface RoleUsage {
  roleId: string;
  name: string;
  userCount: number;
  users: { _id: string; email: string; firstName: string; lastName: string }[];
  /** Candidates for the reassignment dropdown, excluding the role itself. */
  replacements: RoleReplacement[];
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: string[];
  /**
   * Which legacy key a holder is mirrored onto. `User.role` still drives
   * RolesGuard and the frontend Role union, so a custom role needs one — without
   * it a custom role cannot be assigned to anybody at all.
   */
  baseRole?: Role;
}

/** An organisation's branding, with server-side fallbacks already applied. */
export interface Branding {
  displayName: string;
  logoUrl: string;
  accentColor: string;
  /** Readable text colour for controls filled with the accent. Derived server-side. */
  accentForeground: string;
  supportEmail: string;
  /** False when nothing has been set — the shell then uses the platform default. */
  isCustomised: boolean;
  updatedAt: string | null;
}

export type BrandingInput = Partial<Pick<Branding, 'displayName' | 'logoUrl' | 'accentColor' | 'supportEmail'>>;

/**
 * The units this organisation's readings are rendered in.
 *
 * Every field is already resolved by the server, so there is no undefined case
 * to handle at a render site — an organisation that has never chosen gets the
 * canonical units, which is what the stored numbers already are.
 */
export interface DisplayUnits {
  /** m/s | km/h | knots | mph | bft */
  windSpeed: string;
  /** hPa | mbar | inHg | mmHg */
  pressure: string;
  /** °C | °F */
  temperature: string;
  /** m | ft */
  altitude: string;
  /** False when the customer has never chosen — do not imply a choice was made. */
  isCustomised: boolean;
  updatedAt: string | null;
}

export type DisplayUnitsInput = Partial<
  Pick<DisplayUnits, 'windSpeed' | 'pressure' | 'temperature' | 'altitude'>
>;


// ═══ Standalone Phase 4: query screen and rain ════════════════════════════════

/** One row per minute (stored), hour or day (built from the minutes). */
export type QueryResolution = 'minute' | 'hour' | 'day';

/** A column the query screen can offer, in the organisation's display units. */
export interface QueryColumnInfo {
  key: string;
  label: string;
  unit: string;
  /** Only meaningful per minute — e.g. the 2- and 10-minute wind means. */
  minuteOnly: boolean;
}

/** GET /query/columns */
export interface QueryColumnsInfo {
  columns: QueryColumnInfo[];
  timezone: string;
  /** Local hour a day starts, for daily rows and "rain today" (0 = midnight, 9 = BOM). */
  rainDayStartHour: number;
  resolutions: QueryResolution[];
}

export interface QueryResultColumn {
  key: string;
  label: string;
  unit: string;
}

export type QueryRow = { t: number } & Record<string, number | null>;

/** GET /query/measures */
export interface QueryResult {
  columns: QueryResultColumn[];
  rows: QueryRow[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
  resolution: QueryResolution;
  timezone: string;
  rainDayStartHour: number;
}

/** GET /dashboard/met/rain — all null when the station has never reported rain. */
export interface RainSummary {
  todayMm: number | null;
  dayStartMs: number;
  rainDayStartHour: number;
  lastHourMm: number | null;
  /** The last 10 minutes, as mm per hour. */
  rateMmHr: number | null;
}

// ─── The site PC's health (System page) ──────────────────────────────────────

export interface SystemWarning {
  code: 'SENSOR_QUIET' | 'SENSOR_NEVER' | 'STREAM_ERROR' | 'DISK_LOW' | 'BACKUP_FAILED' | 'BACKUP_STALE' | 'BACKUP_NONE' | 'CLOCK_BEHIND' | 'DB_DOWN';
  message: string;
}

/** GET /system/status. */
export interface SystemStatus {
  version: string;
  now: string;
  pcTimeZone: string;
  uptimeSec: number;
  node: string;
  db: { connected: boolean; dataBytes: number | null; storageBytes: number | null; latestMinuteAt: string | null };
  stream: {
    enabled: boolean;
    mode: 'listen' | 'connect';
    port: number | null;
    remote: string | null;
    listening: boolean;
    connected: boolean;
    remoteAddress: string | null;
    connectedAt: string | null;
    lastReadingAt: string | null;
    readingsLastMinute: number;
    minutesWritten: number;
    lastMinuteWrittenAt: string | null;
    checksumErrors: number;
    rainAnomalies: number;
    error: string | null;
  };
  disk: { path: string; freeBytes: number; totalBytes: number } | null;
  backup: { at: string; ok: boolean; path: string; bytes: number; error: string } | null;
  warnings: SystemWarning[];
}
