import type { AlertRulesQuery, AuditQuery, DevicesQuery, RecordsQuery } from '../api/endpoints';

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
 *
 * ⚠ Tenancy rule: these keys carry NO organisation identity — `['devices']`, not
 * `['org', id, 'devices']`. Cache separation between customers therefore rests
 * entirely on the acting organisation never changing without the cache being
 * discarded. Today `useSwitchOrganization` guarantees that twice over: it calls
 * `queryClient.clear()` AND does a full page load. Any NEW path that changes the
 * acting organisation must preserve that invariant, or it will serve one
 * customer's cached data under another customer's name.
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
  metRangeSummary: (deviceId: string, sensor: string, window: string) =>
    ['dashboard', 'met', 'range-summary', deviceId, sensor, window] as const,
  metLatest: (deviceId: string) => ['dashboard', 'met', 'latest', deviceId] as const,
  metWindrose: (deviceId: string) => ['dashboard', 'met', 'windrose', deviceId] as const,
  metHistory: (deviceId: string, sensor: string, from: number, to: number) =>
    ['dashboard', 'met', 'history', deviceId, sensor, from, to] as const,
  metHistoryMulti: (deviceId: string, sensors: string, from: number, to: number) =>
    ['dashboard', 'met', 'history-multi', deviceId, sensors, from, to] as const,

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
    // No interval: the WMO averaging period is fixed at 10 minutes.
    meanWind: (deviceId: string, from: number, to: number) =>
      ['analytics', 'met', 'mean-wind', deviceId, from, to] as const,
    comfort: (deviceId: string, interval: string, from: number, to: number) =>
      ['analytics', 'met', 'comfort', deviceId, interval, from, to] as const,
    fogRisk: (deviceId: string, interval: string, from: number, to: number) =>
      ['analytics', 'met', 'fog-risk', deviceId, interval, from, to] as const,
    pressureTendency: (deviceId: string, hours: number) =>
      ['analytics', 'met', 'pressure-tendency', deviceId, hours] as const,
    metDaily: (deviceId: string, from: number, to: number) =>
      ['analytics', 'met', 'daily-summary', deviceId, from, to] as const,
  },

  // ── Records (Month 9) ──
  records: (q: RecordsQuery) => ['records', q] as const,
  record: (id: string) => ['records', id] as const,
  // The window is PART of the key: without it, changing the range would serve
  // the previous range's rows from cache and the table would not move.
  recordSeries: (id: string, fields: string[], from?: number, to?: number) =>
    ['records', id, 'series', fields.join(','), from ?? null, to ?? null] as const,
  recordMeasures: (id: string, page: number, limit: number, from?: number, to?: number) =>
    ['records', id, 'measures', page, limit, from ?? null, to ?? null] as const,

  // ── Devices (Month 8) ──
  devices: (q: DevicesQuery) => ['devices', q] as const,
  roles: ['roles'] as const,
  branding: ['branding'] as const,
  displayUnits: ['display-units'] as const,
  permissionGroups: ['roles', 'permissions'] as const,
  roleUsage: (id: string) => ['roles', id, 'usage'] as const,
  device: (id: string) => ['devices', id] as const,
  deviceHealth: (id: string) => ['devices', id, 'health'] as const,

  // ── Month 11: alerts, notifications feed, presets ──
  alertRules: (q: AlertRulesQuery) => ['alert-rules', q] as const,
  alertTimeline: (id: string, minutes: number, at?: number) => ['alert-rules', id, 'timeline', minutes, at ?? 'now'] as const,
  alertRule: (id: string) => ['alert-rules', id] as const,
  notificationsFeed: (opts: { unread?: boolean; page?: number; limit?: number }) =>
    ['notifications', 'feed', opts] as const,
  dashboardLayouts: (deviceId?: string) => ['dashboard-layouts', deviceId ?? 'all'] as const,
  // ── Standalone Phase 4: query screen and rain ──
  queryColumns: (deviceId: string) => ['query', 'columns', deviceId] as const,
  queryRows: (p: Record<string, unknown>) => ['query', 'rows', p] as const,
  metRain: (deviceId: string) => ['dashboard', 'met', 'rain', deviceId] as const,
  systemStatus: ['system', 'status'] as const,
};
