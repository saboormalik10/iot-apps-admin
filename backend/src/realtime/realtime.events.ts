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
} as const;

// Client-facing (gateway → browser)
export const ClientEvent = {
  MET_LATEST: 'met:latest',
  MET_WINDROSE: 'met:windrose',
  NEP_SAMPLE: 'nep:sample',
  NEP_SESSION_CREATED: 'nep:session:created',
  DEVICE_STATUS: 'device:status',
  DEVICE_CONNECTED: 'device:connected',
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

export const roomForOrg = (orgId: string) => `org:${orgId}`;
export const roomForDevice = (deviceId: string) => `device:${deviceId}`;
