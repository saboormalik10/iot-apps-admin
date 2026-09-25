/**
 * Client-facing socket.io event names — MIRRORED from the backend
 * `backend/src/realtime/realtime.events.ts` (plan §3.2). Exact strings matter:
 * the gateway emits `notification:new` (not `notification`), and subscribing to a
 * wrong string silently receives nothing. Never hand-type these at call sites — import here.
 *
 * The CI `check-contract` step diffs these values against the backend file.
 */
export const ClientEvent = {
  MET_LATEST: 'met:latest',
  MET_WINDROSE: 'met:windrose',
  MET_LIVE: 'met:live',
  DEVICE_STATUS: 'device:status',
  DEVICE_CONNECTED: 'device:connected',
  NOTIFICATION: 'notification:new',
  ALERT_TRIGGERED: 'alert:triggered',
} as const;

export type ClientEventName = (typeof ClientEvent)[keyof typeof ClientEvent];

// Room helpers (mirror the backend) — used for reference / typed subscriptions.
export const roomForOrg = (orgId: string) => `org:${orgId}`;
export const roomForDevice = (deviceId: string) => `device:${deviceId}`;
export const roomForUser = (userId: string) => `user:${userId}`;

// ── Payload shapes (subset needed in Month 7) ────────────────────────────────
export interface NotificationPayload {
  _id?: string;
  type: 'alert';
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Payload of `met:live` — one sensor reading as it arrives, for the wind dial only.
 * Mirrored from backend/src/realtime/realtime.events.ts. Never stored.
 */
export interface MetLivePayload {
  deviceId: string;
  measuredAtMs: number;
  windSpeedMs: number | null;
  /** True bearing — the station's mast offset already applied. */
  windDirTrueDeg: number | null;
}

export interface AlertTriggeredPayload {
  ruleId?: string;
  deviceId?: string;
  sensor?: string;
  sensorValue?: number;
  threshold?: number;
}

export interface DeviceStatusPayload {
  deviceId: string;
  deviceName: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  batteryPct: number | null;
}

/**
 * Payload of `met:latest`, mirrored from backend/src/realtime/realtime.events.ts.
 *
 * A deliberate SUBSET of the REST `MetLatest`: it carries what changes every
 * minute, not what does not (deviceName, headingOffsetDeg). Consumers MERGE it
 * into the cached reading rather than replacing — replacing would blank the
 * fields the socket does not send.
 *
 * The backend suppresses this event for backfills, so anything arriving here is
 * genuinely live and safe to show as "now".
 */
export interface MetLatestPayload {
  measuredAtMs: number;
  recordId: string;
  windSpeedMs: number | null;
  windSpeedKmh: number | null;
  windDirTrueDeg: number | null;
  windDirRelDeg: number | null;
  tempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  dewPointC: number | null;
}
