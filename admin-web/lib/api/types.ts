/**
 * Domain types for the Month-7 API surface. Hand-authored from the backend
 * Swagger (audience: 🖥️ Admin Panel). The CI `check-contract` script asserts the
 * paths/methods the client depends on still exist in the live spec (drift check),
 * so these types can't silently rot against the backend.
 */

export type Role = 'admin' | 'operator' | 'viewer';

/** Compact user identity returned by login / accept-invite. */
export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string;
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
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  invitedAt: string | null;
}

/** Mobile-app user with upload activity — GET /organizations/me/mobile-users. */
export interface MobileUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  /** Which app the user signed up from (null = inferred from activity). */
  mobileAppType: DeviceType | null;
  createdAt: string;
  lastLoginAt: string | null;
  metRecordCount: number;
  nepSessionCount: number;
  lastUploadAt: string | null;
  /** Devices this user registered or synced data for. */
  devices: { id: string; name: string; type: DeviceType }[];
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
  | 'org'
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

export type NotificationKind = 'alert' | 'session_complete' | 'firmware';

export interface AppNotification {
  _id: string;
  type: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/** Login / accept-invite response body (before the BFF strips the tokens). */
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
  nepLinkDevices: number;
  totalMetRecords: number;
  totalNepSessions: number;
  /** §10.8 — count of armed (isActive) alert rules. */
  activeAlertRules: number;
  /** §10.8 — last-14-day daily counts, oldest→newest. */
  sparklines: { records: number[]; sessions: number[] };
  serverTime: string;
}

/** GET /dashboard/devices — one row per device with live-ish status. */
export interface DashboardDevice {
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

/** One raw wind sample from GET /dashboard/met/windrose. */
export interface WindSample {
  speedMs: number | null;
  speedKmh: number | null;
  dirTrueDeg: number | null;
  dirRelDeg: number | null;
  timestampMs: number;
}
export interface MetWindrose {
  recordId: string;
  /** ≈10 min of samples. */
  last600: WindSample[];
  /** ≈2 min of samples. */
  last120: WindSample[];
}

/** GET /dashboard/met/history — 1-min bucketed series for one sensor. */
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
}

/** GET /dashboard/nep/latest. */
export interface NepLatest {
  session: {
    id: string;
    deviceName: string;
    startTimestamp: number;
    endTimestamp: number | null;
    sampleCount: number;
    turbidityAvg: number | null;
    turbidityMin: number | null;
    turbidityMax: number | null;
    temperatureAvg: number | null;
    probeRange: string | null;
    hasTempData: boolean;
    hasGpsData: boolean;
  };
  latestSample: {
    timestamp: number;
    turbidityValue: number | null;
    temperatureValue: number | null;
    probeRange: string | null;
    locationLat: number | null;
    locationLng: number | null;
    batteryLevel: number | null;
  } | null;
}

/** GET /dashboard/org/device-map — last-known GPS + status per device. */
export interface FleetMapPoint {
  deviceId: string;
  deviceName: string;
  type: DeviceType;
  isOnline: boolean;
  lastSeenAt: string | null;
  lastGpsLat: number;
  lastGpsLng: number;
  lastWindSpeedKmh?: number | null;
  lastTurbidityNtu?: number | null;
  batteryPct: number | null;
}

// ─── Month 8: Devices ────────────────────────────────────────────────────────

/** GET /devices/:id (+ list rows). */
export interface Device {
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
  createdAt: string;
  updatedAt: string;
}

export interface DeviceStats {
  sessionCount: number;
  lastActivityAt: string | null;
}

export interface DeviceHealth {
  deviceId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  batteryPct: number | null;
  batteryVoltage: number | null;
  batteryCharging: boolean | null;
  firmwareVersion: string | null;
  firmwareAgeDays: number | null;
  lastSyncAt: string | null;
  lastSyncLagSeconds: number | null;
  alertCount24h: number;
}

export interface FirmwareHistoryEntry {
  _id: string;
  deviceId: string;
  version: string;
  detectedAt: string;
}
export interface FirmwareHistory {
  deviceId: string;
  history: FirmwareHistoryEntry[];
}

export interface FirmwareTarget {
  deviceType: DeviceType;
  version: string;
}

export interface FirmwareStatusRow {
  deviceId: string;
  name: string;
  type: DeviceType;
  firmwareVersion: string | null;
  target: string | null;
  targetSource: 'configured' | 'max-seen';
  outdated: boolean;
}
export interface FirmwareStatus {
  rows: FirmwareStatusRow[];
  total: number;
  outdated: number;
}

/** One row of the per-sensor NMEA show/log grid. */
export interface SensorPref {
  NMEA: string;
  Type: string;
  Unit: string;
  Desc: string;
  EnShow?: number;
  EnLog?: number;
}

/** GET/PATCH /devices/:id/settings — the full instrument config. */
export interface DeviceSettings {
  deviceId: string;
  qqEnabled: boolean;
  qqGpsHeight: boolean;
  qfeHeightM: number;
  qnhHeightM: number;
  dewPointEnabled: boolean;
  windRoseUnit: string;
  windRosePeriod: string;
  windRoseOrient: string;
  graphicalType: string;
  graphItem: number;
  colorScheme: number;
  pageLayout: number;
  unitWindSpeed: string;
  unitPressure: string;
  unitTemperature: string;
  unitAltitude: string;
  sensorShowPrefs: SensorPref[] | null;
  sensorLogPrefs: SensorPref[] | null;
  updatedAt: string;
}

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
  isDemoMode: boolean;
  createdAt: string;
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

// ═══ Month 10: NEP analytics, maps, sessions, org rollups ════════════════════

/** GET /analytics/nep/turbidity-distribution — histogram over the 7 WHO/EPA classes. */
export interface NepTurbidityBucket {
  label: string;
  minNtu: number;
  maxNtu: number | null;
  count: number;
  pct: number;
  waterQualityClass: string;
  /** Backend advisory hex — NOT rendered (§10.9 colour-source rule); we map by class index. */
  color: string;
}
export interface NepTurbidityDistribution {
  probeRange: string | null;
  totalSamples: number;
  buckets: NepTurbidityBucket[];
}

/** GET /analytics/nep/session-comparison — overlay on an offset-from-start axis. */
export interface NepComparisonSessionMeta {
  id: string;
  label: string;
  /** Backend palette hex — the chart uses categorical roles by index instead. */
  color: string;
  probeRange: string | null;
  startTimestamp: number;
}
export interface NepComparisonPoint {
  offsetMs: number;
  values: Record<string, number | null>;
}
export interface NepSessionComparison {
  sessions: NepComparisonSessionMeta[];
  timeSeries: NepComparisonPoint[];
}

/** GET /analytics/nep/water-quality-summary — the WHO/EPA badge tile. */
export interface NepWaterQuality {
  avgNtu: number | null;
  maxNtu: number | null;
  minNtu: number | null;
  probeRange: string | null;
  who: { compliant: boolean; threshold: number };
  epa: { recreational: 'safe' | 'caution' | 'unsafe'; threshold: number };
  isoLabel: string;
  badgeColor: string;
}

/** GET /analytics/nep/probe-range-breakdown — daily R1/R2/R3 stacked bar. */
export interface NepProbeBreakdownRow {
  date: string;
  r1Count: number;
  r2Count: number;
  r3Count: number;
  r1Pct: number;
  r2Pct: number;
  r3Pct: number;
  totalSamples: number;
}
export interface NepProbeBreakdown {
  deviceId: string;
  data: NepProbeBreakdownRow[];
}

/** GET /analytics/nep/turbidity-temperature-correlation — scatter + Pearson r. */
export interface NepCorrelationPoint {
  ntu: number;
  tempC: number;
}
export interface NepCorrelation {
  pearsonR: number | null;
  rSquared: number | null;
  trend: 'positive' | 'negative' | 'none';
  significance: 'strong' | 'moderate' | 'weak' | 'none';
  sampleCount: number;
  interpretation: string;
  scatterPoints: NepCorrelationPoint[];
}

/** GET /analytics/nep/session-events — turbidity-spike events within a session. */
export interface NepSessionEvent {
  eventStart: number;
  eventEnd: number;
  durationMin: number;
  peakNtu: number;
  peakAt: number;
  meanNtu: number;
  probeRange: string | null;
  gpsCentroid: { lat: number; lng: number } | null;
}
export interface NepSessionEvents {
  sessionId: string;
  threshold: number;
  eventGapMin: number;
  events: NepSessionEvent[];
}

/** GET /analytics/nep/gps-density — grid-cell turbidity averages (map heatmap). */
export interface NepGpsCell {
  lat: number;
  lng: number;
  avgTurbidity: number | null;
  maxTurbidity: number | null;
  sampleCount: number;
  dominantProbeRange: string | null;
}
export interface NepGpsDensity {
  deviceId: string;
  resolution: string;
  cellMeters: number;
  cells: NepGpsCell[];
}

/** GET /analytics/org/device-comparison — multi-device single-sensor overlay. */
export interface DeviceComparisonSeries {
  deviceId: string;
  deviceName: string;
  /** Backend palette hex — chart uses categorical roles by index. */
  color: string;
  values: { ts: number; value: number | null }[];
}
export interface OrgDeviceComparison {
  sensor: string;
  unit: string;
  interval: string;
  series: DeviceComparisonSeries[];
}

/** GET /analytics/org/fleet-health — one row per device with health metrics. */
export interface FleetHealthRow {
  deviceId: string;
  deviceName: string;
  type: DeviceType;
  isOnline: boolean;
  lastSeenAt: string | null;
  batteryPct: number | null;
  batteryCharging: boolean | null;
  daysSinceFirst: number | null;
  totalRecords: number;
  totalSessions: number;
  storageEstimateMb: number | null;
}

/** GET /analytics/nep/daily-summary (§10.7). */
export interface NepDailySummary {
  deviceId: string;
  organizationId: string;
  date: string;
  dateMs: number;
  turbidityAvg: number | null;
  turbidityMax: number | null;
  turbidityMin: number | null;
  turbidityStdDev: number | null;
  temperatureAvg: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  sessionCount: number;
  totalSamples: number;
  dominantProbeRange: string | null;
  r1SampleCount: number;
  r2SampleCount: number;
  r3SampleCount: number;
  drinkingCompliant: boolean | null;
  recreationalSafe: boolean | null;
}

/** GET /dashboard/nep/analytics — cross-session daily turbidity trend. */
export interface NepCrossSessionTrendRow {
  date: string;
  avgTurbidity: number | null;
  maxTurbidity: number | null;
  minTurbidity: number | null;
  sessionCount: number;
  totalSamples: number;
}
export interface NepCrossSessionTrend {
  deviceId: string;
  data: NepCrossSessionTrendRow[];
}

// ── Sessions (NEP) module ────────────────────────────────────────────────────

/** A NEP-LINK session (list row + detail header). */
export interface NepSessionRow {
  id: string;
  organizationId: string;
  deviceId: string;
  deviceName: string;
  startTimestamp: number;
  endTimestamp: number | null;
  timezoneName: string;
  timezoneOffset: number;
  probeRange: string | null;
  comment: string;
  sampleCount: number;
  turbidityAvg: number | null;
  turbidityMin: number | null;
  turbidityMax: number | null;
  temperatureAvg: number | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
  hasTempData: boolean;
  hasGpsData: boolean;
  isDemoMode: boolean;
  syncedAt: string;
  createdAt: string;
}

/** One sample row from GET /sessions/:id/samples. */
export interface NepSampleRow {
  _id?: string;
  sessionId?: string;
  timestamp: number;
  turbidityValue: number | null;
  temperatureValue: number | null;
  probeRange: string | null;
  locationLat: number | null;
  locationLng: number | null;
  batteryLevel: number | null;
  _downsampled?: boolean;
}

/** GET /dashboard/nep/map — GPS points coloured by turbidity. */
export interface NepMapPoint {
  timestamp: number;
  lat: number | null;
  lng: number | null;
  turbidityValue: number | null;
  probeRange: string | null;
}
export interface NepMap {
  sessionId: string;
  points: NepMapPoint[];
}

/** GET /sessions/:id/files — an attached photo/map/thumbnail (Cloudinary). */
export interface SessionFile {
  _id: string;
  fileType: 'map' | 'photo' | 'thumbnail';
  mimeType: string;
  sizeBytes: number;
  url: string;
  capturedAt?: string | null;
  createdAt?: string;
}

// ═══ Month 11: Alerts, Notifications (tokens), Share, Dashboard presets ═══════

/** Alert-rule app family — NOTE: 'MET'|'NEP', not the DeviceType 'MET-LINK'|'NEP-LINK'. */
export type AlertAppType = 'MET' | 'NEP';
export type AlertCondition = 'gt' | 'lt' | 'gte' | 'lte';

/** One entry of a rule's rolling trigger log (server caps at 50). */
export interface TriggerHistoryEntry {
  triggeredAt: string;
  sensorValue: number;
  notifiedCount: number;
}

/** GET /alert-rules — a per-device+sensor threshold rule (list row + detail). */
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

/** GET /notifications/tokens — a registered mobile push target (admin registry). */
export interface PushToken {
  _id: string;
  platform: 'ios' | 'android';
  appId: string;
  deviceModel: string;
  expiresAt: string;
  createdAt?: string;
  updatedAt?: string;
}

/** POST /share response — a created public link (+ the token to build the /s URL). */
export interface ShareLink {
  _id: string;
  token: string;
  /** Backend-built URL — points at the API `/public/:token`; the panel builds its own /s/ link. */
  url: string;
  resourceType: ShareResourceType;
  resourceId: string;
  expiresAt: string | null;
  createdAt: string;
}

/** GET /share — a share-link row (lean ShareToken; carries viewCount + revoke state). */
export interface ShareTokenRow {
  _id: string;
  token: string;
  resourceType: ShareResourceType;
  resourceId: string;
  expiresAt: string | null;
  viewCount: number;
  revokedAt: string | null;
  createdAt: string;
}

export type ShareResourceType = 'nepSession' | 'metRecord';

/** GET /public/:token — the unauthenticated read-only snapshot (static, no realtime). */
export interface PublicSnapshotPhoto {
  url: string;
  filename: string;
  type?: string;
}
export interface PublicNepSnapshot {
  resourceType: 'nepSession';
  sharedAt: string;
  expiresAt: string | null;
  session: {
    id: string;
    deviceName: string;
    startTimestamp: number;
    endTimestamp: number | null;
    probeRange: string | null;
    sampleCount: number;
    turbidityAvg: number | null;
    turbidityMin: number | null;
    turbidityMax: number | null;
    temperatureAvg: number | null;
    comment: string;
  };
  trend: { t: number; turbidity: number | null; temperature: number | null }[];
  photos: PublicSnapshotPhoto[];
}
export interface PublicMetSnapshot {
  resourceType: 'metRecord';
  sharedAt: string;
  expiresAt: string | null;
  record: {
    id: string;
    deviceName: string;
    dateStart: string;
    dateEnd: string | null;
    measureCount: number;
    comment: string;
  };
  photos: PublicSnapshotPhoto[];
}
export type PublicSnapshot = PublicNepSnapshot | PublicMetSnapshot;

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
