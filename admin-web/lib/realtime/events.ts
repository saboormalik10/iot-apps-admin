/**
 * Client-facing socket.io event names — MIRRORED from the backend
 * `backend/src/realtime/realtime.events.ts` (plan §3.2). Exact strings matter:
 * the gateway emits `nep:session:created` / `notification:new` (not
 * `nep:session_created` / `notification`), and subscribing to a wrong string
 * silently receives nothing. Never hand-type these at call sites — import here.
 *
 * The CI `check-contract` step diffs these values against the backend file.
 */
export const ClientEvent = {
  MET_LATEST: 'met:latest',
  MET_WINDROSE: 'met:windrose',
  NEP_SAMPLE: 'nep:sample',
  NEP_SESSION_CREATED: 'nep:session:created',
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
  type: 'alert' | 'session_complete' | 'firmware';
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  createdAt: string;
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
