import type { AlertRulesQuery, AuditQuery, DevicesQuery, RecordsQuery, SessionsQuery } from '../api/endpoints';

/**
 * Central query-key factory. Realtime events invalidate by these keys (plan §3.1
 * "invalidate the sessions list rather than hand-patching it"), so every consumer
 * must key through here — never inline string arrays.
 *
 * ⚠ Time-range rule (prevents refetch loops): any key that includes a time window
 * (`from`/`to`) MUST take those values from the memoized `useScope().window` — never
 * from a raw `Date.now()` computed in a component body. An unmemoized `Date.now()`
 * changes every render, so the key changes every render → fetch → re-render → fetch,
 * forever. The Scope Bar window is quantized to the minute and memoized for exactly
 * this reason (see lib/hooks/use-scope.ts). All Month-9 analytics keys follow this.
 */
export const queryKeys = {
  session: ['session'] as const,
  org: ['org'] as const,
  users: ['users'] as const,
  mobileUsers: ['users', 'mobile'] as const,
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

  // ── Analytics (Month 9) — time windows come from the memoized useScope().window ──
  analytics: {
    all: ['analytics'] as const,
    met: ['analytics', 'met'] as const,
    windRose: (deviceId: string, from: number, to: number) =>
      ['analytics', 'met', 'wind-rose', deviceId, from, to] as const,
    multiSensor: (deviceId: string, sensors: string, interval: string, from: number, to: number) =>
      ['analytics', 'met', 'multi-sensor', deviceId, sensors, interval, from, to] as const,
    statistics: (deviceId: string, sensor: string, from: number, to: number) =>
      ['analytics', 'met', 'statistics', deviceId, sensor, from, to] as const,
    windGust: (deviceId: string, interval: string, from: number, to: number) =>
      ['analytics', 'met', 'wind-gust', deviceId, interval, from, to] as const,
    comfort: (deviceId: string, interval: string, from: number, to: number) =>
      ['analytics', 'met', 'comfort', deviceId, interval, from, to] as const,
    fogRisk: (deviceId: string, interval: string, from: number, to: number) =>
      ['analytics', 'met', 'fog-risk', deviceId, interval, from, to] as const,
    pressureTendency: (deviceId: string, hours: number) =>
      ['analytics', 'met', 'pressure-tendency', deviceId, hours] as const,
    metDaily: (deviceId: string, from: number, to: number) =>
      ['analytics', 'met', 'daily-summary', deviceId, from, to] as const,

    // ── NEP analytics (Month 10) — device/session scoped, memoized window ──
    nep: ['analytics', 'nep'] as const,
    nepTurbidity: (deviceId: string, from: number, to: number) =>
      ['analytics', 'nep', 'turbidity-distribution', deviceId, from, to] as const,
    nepProbe: (deviceId: string, from: number, to: number) =>
      ['analytics', 'nep', 'probe-range', deviceId, from, to] as const,
    nepCorrelation: (deviceId: string, sessionId: string, from: number, to: number) =>
      ['analytics', 'nep', 'correlation', deviceId, sessionId, from, to] as const,
    nepGpsDensity: (deviceId: string, resolution: string, from: number, to: number) =>
      ['analytics', 'nep', 'gps-density', deviceId, resolution, from, to] as const,
    nepComparison: (sessionIds: string) => ['analytics', 'nep', 'session-comparison', sessionIds] as const,
    nepWaterQuality: (sessionId: string) => ['analytics', 'nep', 'water-quality', sessionId] as const,
    nepSessionEvents: (sessionId: string) => ['analytics', 'nep', 'session-events', sessionId] as const,
    nepDaily: (deviceId: string, from: number, to: number) =>
      ['analytics', 'nep', 'daily-summary', deviceId, from, to] as const,
    nepCrossTrend: (deviceId: string, from: number, to: number) =>
      ['analytics', 'nep', 'cross-session-trend', deviceId, from, to] as const,

    // ── Org rollups (Month 10) ──
    fleetHealth: ['analytics', 'org', 'fleet-health'] as const,
    deviceComparison: (deviceIds: string, sensor: string, interval: string, from: number, to: number) =>
      ['analytics', 'org', 'device-comparison', deviceIds, sensor, interval, from, to] as const,
  },

  // ── Sessions (Month 10 — NEP sessions module) ──
  sessions: (q: SessionsQuery) => ['sessions', q] as const,
  nepSession: (id: string) => ['sessions', id] as const,
  sessionSamples: (id: string, page: number, limit: number, downsample: boolean) =>
    ['sessions', id, 'samples', page, limit, downsample] as const,
  sessionTrail: (id: string) => ['sessions', id, 'trail'] as const,
  sessionFiles: (id: string) => ['sessions', id, 'files'] as const,

  // ── Records (Month 9) ──
  records: (q: RecordsQuery) => ['records', q] as const,
  record: (id: string) => ['records', id] as const,
  recordMeasures: (id: string, page: number, limit: number) => ['records', id, 'measures', page, limit] as const,

  // ── Devices (Month 8) ──
  devices: (q: DevicesQuery) => ['devices', q] as const,
  device: (id: string) => ['devices', id] as const,
  deviceStats: (id: string) => ['devices', id, 'stats'] as const,
  deviceHealth: (id: string) => ['devices', id, 'health'] as const,
  firmwareHistory: (id: string) => ['devices', id, 'firmware-history'] as const,
  deviceSettings: (id: string) => ['devices', id, 'settings'] as const,
  firmwareTargets: ['devices', 'firmware-target'] as const,
  firmwareStatus: (type?: string) => ['devices', 'firmware-status', type ?? 'all'] as const,

  // ── Month 11: alerts, notifications feed, share, presets ──
  alertRules: (q: AlertRulesQuery) => ['alert-rules', q] as const,
  alertRule: (id: string) => ['alert-rules', id] as const,
  notificationsFeed: (opts: { unread?: boolean; page?: number; limit?: number }) =>
    ['notifications', 'feed', opts] as const,
  pushTokens: ['notifications', 'tokens'] as const,
  shares: (q: { page?: number; limit?: number }) => ['share', q] as const,
  dashboardLayouts: (deviceId?: string) => ['dashboard-layouts', deviceId ?? 'all'] as const,
};
