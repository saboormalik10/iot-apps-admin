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

export interface MetMeasuresEvent {
  organizationId: string;
  deviceId: string;
  recordId: string;
  latest: Record<string, unknown>;
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
