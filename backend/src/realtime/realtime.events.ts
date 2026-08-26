/**
 * Internal domain-event names (emitted by services via EventEmitter2) and the
 * client-facing socket.io event names (broadcast by the gateway).
 *
 * Services stay decoupled from the gateway: they only `eventEmitter.emit(...)`.
 * The gateway subscribes with `@OnEvent` and re-broadcasts to device/org rooms.
 */

// Internal (service → gateway)
export const DomainEvent = {
  MET_MEASURES: 'met.measures',
  NEP_SAMPLE: 'nep.sample',
  NEP_SESSION_CREATED: 'nep.session.created',
  DEVICE_STATUS: 'device.status',
  // Month 6
  NOTIFICATION: 'notification', // NotificationsService → gateway (feed push)
  NEP_SESSION_COMPLETED: 'nep.session.completed', // sync → notifications listener
  DEVICE_FIRMWARE_REPORTED: 'device.firmware.reported', // sync → notifications listener
} as const;

// Client-facing (gateway → browser)
export const ClientEvent = {
  MET_LATEST: 'met:latest',
  MET_WINDROSE: 'met:windrose',
  NEP_SAMPLE: 'nep:sample',
  NEP_SESSION_CREATED: 'nep:session:created',
  DEVICE_STATUS: 'device:status',
  DEVICE_CONNECTED: 'device:connected',
  // Month 6
  NOTIFICATION: 'notification:new',
  ALERT_TRIGGERED: 'alert:triggered',
} as const;

/**
 * The single reading broadcast as `met:latest`.
 *
 * A deliberate SUBSET of the REST `MetLatest` shape: it carries the values that
 * change every minute, not the ones that do not (deviceName, headingOffsetDeg).
 * Consumers merge it into what they already hold rather than replacing.
 *
 * Previously typed `Record<string, unknown>`, which meant the browser discarded
 * it and refetched instead — a round trip for data already in hand.
 */
// Declared as a `type`, not an `interface`, deliberately: a type alias gets an
// implicit index signature and so remains assignable to Record<string, unknown>,
// which the alert evaluator takes. An interface here breaks that call site.
export type MetLatestPayload = {
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
};

export interface MetMeasuresEvent {
  organizationId: string;
  deviceId: string;
  recordId: string;
  latest: MetLatestPayload;
  /**
   * Every LOCAL day key the batch touched, e.g. ['2026-08-19','2026-08-20'].
   * The rollup listener previously recomputed only the day containing `latest`,
   * so a catch-up batch spanning several days silently rolled up just the last.
   * Optional, so existing emitters compile unchanged.
   */
  dayKeys?: string[];
  /**
   * True when `latest` is historical rather than live — a backfill or a
   * catch-up after an outage. The gateway suppresses the live-value broadcast
   * for these, otherwise the dashboard gauge jumps backwards in time.
   */
  isBackfill?: boolean;
  source?: 'sftp' | 'mobile';
  /** IANA zone the day keys were computed in. */
  timezone?: string;
  /**
   * Per-field min/max across the WHOLE batch, not just the newest row.
   *
   * A threshold alarm asks "was the threshold crossed at any point", and a file
   * carries ~52 readings at 1 Hz. Measured on 399 real files, the peak exceeds
   * the last reading in 86.7% of them — so evaluating `latest` alone misses most
   * gusts, which is precisely what a wind alarm exists to catch.
   *
   * Optional: emitters that have no batch (the mobile-era paths) omit it and the
   * evaluator falls back to `latest`.
   */
  extremes?: Record<string, { min: number; max: number }>;
}

export interface NepSampleEvent {
  organizationId: string;
  deviceId: string;
  sessionId: string;
  sample: Record<string, unknown>;
}

export interface NepSessionCreatedEvent {
  organizationId: string;
  deviceId: string;
  sessionId: string;
  startTimestamp: number;
  probeRange: string | null;
}

export interface DeviceStatusEvent {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
  batteryPct: number | null;
  justConnected?: boolean;
}

// ── Month 6 ─────────────────────────────────────────────────────────────────

export type NotificationKind = 'alert' | 'session_complete' | 'firmware';

/** Emitted by NotificationsService → EventsGateway re-broadcasts to user/org rooms. */
export interface NotificationEvent {
  organizationId: string;
  userIds: string[]; // resolved target users; empty → org-wide room
  notification: {
    _id?: string;
    type: NotificationKind;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
    createdAt: Date | string;
  };
}

/** Emitted by sync.service when a NEP session's endTimestamp first becomes non-null. */
export interface NepSessionCompletedEvent {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  sessionId: string;
  sampleCount: number;
}

/** Emitted by sync.service on heartbeat so a listener can compare against the org firmware target. */
export interface DeviceFirmwareReportedEvent {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  deviceType: 'MET-LINK' | 'NEP-LINK';
  firmwareVersion: string;
}

export const roomForOrg = (orgId: string) => `org:${orgId}`;
export const roomForDevice = (deviceId: string) => `device:${deviceId}`;
export const roomForUser = (userId: string) => `user:${userId}`;
