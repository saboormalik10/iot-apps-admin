import type { AuditQuery, DevicesQuery } from '../api/endpoints';

/**
 * Central query-key factory. Realtime events invalidate by these keys (plan §3.1
 * "invalidate the sessions list rather than hand-patching it"), so every consumer
 * must key through here — never inline string arrays.
 */
export const queryKeys = {
  session: ['session'] as const,
  org: ['org'] as const,
  users: ['users'] as const,
  audit: (q: AuditQuery) => ['audit', q] as const,
  profile: ['profile'] as const,
  notifications: (opts: { unread?: boolean; limit?: number }) => ['notifications', opts] as const,

  // ── Dashboard (Month 8) ──
  summary: ['dashboard', 'summary'] as const,
  dashboardDevices: ['dashboard', 'devices'] as const,
  metLatest: (deviceId: string) => ['dashboard', 'met', 'latest', deviceId] as const,
  metWindrose: (deviceId: string) => ['dashboard', 'met', 'windrose', deviceId] as const,
  metHistory: (deviceId: string, sensor: string, from: number, to: number) =>
    ['dashboard', 'met', 'history', deviceId, sensor, from, to] as const,
  nepLatest: (deviceId: string) => ['dashboard', 'nep', 'latest', deviceId] as const,
  orgDeviceMap: ['dashboard', 'org', 'device-map'] as const,

  // ── Devices (Month 8) ──
  devices: (q: DevicesQuery) => ['devices', q] as const,
  device: (id: string) => ['devices', id] as const,
  deviceStats: (id: string) => ['devices', id, 'stats'] as const,
  deviceHealth: (id: string) => ['devices', id, 'health'] as const,
  firmwareHistory: (id: string) => ['devices', id, 'firmware-history'] as const,
  deviceSettings: (id: string) => ['devices', id, 'settings'] as const,
  firmwareTargets: ['devices', 'firmware-target'] as const,
  firmwareStatus: (type?: string) => ['devices', 'firmware-status', type ?? 'all'] as const,
};
