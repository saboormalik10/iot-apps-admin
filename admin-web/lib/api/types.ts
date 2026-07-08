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
