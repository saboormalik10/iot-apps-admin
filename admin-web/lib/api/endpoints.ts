import { http } from './http';
import { normalizePage, fullArrayPage, type Page } from './pagination';
import type {
  AppNotification,
  AuditEntry,
  DashboardDevice,
  DashboardSummary,
  Device,
  DeviceHealth,
  DeviceSettings,
  DeviceStats,
  DeviceType,
  FirmwareHistory,
  FirmwareStatus,
  FirmwareStatusRow,
  FirmwareTarget,
  FleetMapPoint,
  MetComfort,
  MetDailySummary,
  MetFogRisk,
  MetHistory,
  MetLatest,
  MetMeasureRow,
  MetMultiSensor,
  MetPressureTendency,
  MetRecordRow,
  MetStatistics,
  MetWindGust,
  MetWindRoseAgg,
  MetWindrose,
  MobileUser,
  NepLatest,
  Organization,
  OrgUser,
  Profile,
  Role,
  SessionUser,
} from './types';
import type {
  CreateDeviceInput,
  DeviceSettingsInput,
  InviteUserInput,
  UpdateDeviceInput,
  UpdateOrgInput,
  UpdateUserInput,
} from './schemas';

/**
 * Typed endpoint functions. Every path is relative to the BFF (`/api/**`) — the
 * generic proxy attaches the token and refreshes on 401. This is the single
 * place backend paths are named on the client (drift-checked in CI).
 */

// ── Session (who am I) ──────────────────────────────────────────────────────
export const getSession = (signal?: AbortSignal) => http.get<SessionUser | null>('/auth/session', signal);

// ── Organization ────────────────────────────────────────────────────────────
export const getOrganization = (signal?: AbortSignal) => http.get<Organization>('/organizations/me', signal);
export const updateOrganization = (input: UpdateOrgInput) => http.patch<Organization>('/organizations/me', input);

// ── People ──────────────────────────────────────────────────────────────────
// The endpoint returns the FULL array (unpaginated) — sort/filter client-side.
export const listUsers = async (signal?: AbortSignal): Promise<Page<OrgUser>> => {
  const rows = await http.get<OrgUser[]>('/organizations/me/users', signal);
  return fullArrayPage(rows);
};
export const listMobileUsers = (signal?: AbortSignal) =>
  http.get<MobileUser[]>('/organizations/me/mobile-users', signal);
export const inviteUser = (input: InviteUserInput) =>
  http.post<{ user: OrgUser }>('/organizations/me/users/invite', input);
export const updateUser = (id: string, input: UpdateUserInput) =>
  http.patch<OrgUser>(`/organizations/me/users/${id}`, input);

// ── Audit log (server-paginated + server-side filters) ──────────────────────
export interface AuditQuery {
  action?: string;
  resourceType?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
export const listAudit = async (q: AuditQuery, signal?: AbortSignal): Promise<Page<AuditEntry>> => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  const body = await http.getRaw<{ data: AuditEntry[]; pagination: unknown }>(
    `/audit${qs ? `?${qs}` : ''}`,
    signal,
  );
  return normalizePage<AuditEntry>(body as never);
};

// ── Profile ─────────────────────────────────────────────────────────────────
export const getProfile = (signal?: AbortSignal) => http.get<Profile>('/users/me', signal);
export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  currentPassword?: string;
  newPassword?: string;
}
export const updateProfile = (input: UpdateProfilePayload) => http.patch<Profile>('/users/me', input);

// ── Notifications (the first live feature — PR5 bell reads unreadCount) ──────
export interface NotificationsResult {
  page: Page<AppNotification>;
  unreadCount: number;
}
export const listNotifications = async (
  opts: { unread?: boolean; limit?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationsResult> => {
  const params = new URLSearchParams();
  if (opts.unread) params.set('unread', 'true');
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const body = await http.getRaw<{ data: AppNotification[]; pagination: unknown; unreadCount: number }>(
    `/notifications${qs ? `?${qs}` : ''}`,
    signal,
  );
  return { page: normalizePage<AppNotification>(body as never), unreadCount: body.unreadCount ?? 0 };
};
export const markNotificationRead = (id: string) => http.patch<unknown>(`/notifications/${id}/read`, {});
export const markAllNotificationsRead = () => http.post<{ updated: number }>('/notifications/read-all', {});

// ── Dashboard (Month 8) ─────────────────────────────────────────────────────
const demoParam = (includeDemo?: boolean) => (includeDemo ? '&includeDemoMode=true' : '');

export interface SummaryScope {
  includeDemo?: boolean;
  type?: DeviceType;
  deviceId?: string;
}
export const getSummary = (scope: SummaryScope = {}, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  if (scope.includeDemo) params.set('includeDemoMode', 'true');
  if (scope.type) params.set('type', scope.type);
  if (scope.deviceId) params.set('deviceId', scope.deviceId);
  const qs = params.toString();
  return http.get<DashboardSummary>(`/dashboard/summary${qs ? `?${qs}` : ''}`, signal);
};
export const getDashboardDevices = (signal?: AbortSignal) =>
  http.get<DashboardDevice[]>('/dashboard/devices', signal);
export const getMetLatest = (deviceId: string, includeDemo = false, signal?: AbortSignal) =>
  http.get<MetLatest | null>(`/dashboard/met/latest?deviceId=${deviceId}${demoParam(includeDemo)}`, signal);
export const getMetWindrose = (deviceId: string, includeDemo = false, signal?: AbortSignal) =>
  http.get<MetWindrose>(`/dashboard/met/windrose?deviceId=${deviceId}${demoParam(includeDemo)}`, signal);
export const getMetHistory = (
  params: { deviceId: string; sensor: string; from: number; to: number; includeDemo?: boolean },
  signal?: AbortSignal,
) => {
  const qs = new URLSearchParams({
    deviceId: params.deviceId,
    sensor: params.sensor,
    from: String(params.from),
    to: String(params.to),
  });
  if (params.includeDemo) qs.set('includeDemoMode', 'true');
  // getRaw (NOT get): the payload itself has a top-level `data` array, which the
  // `{ data }`-envelope unwrapper in http.get would wrongly strip to just the array.
  return http.getRaw<MetHistory>(`/dashboard/met/history?${qs.toString()}`, signal);
};
export const getNepLatest = (deviceId: string, includeDemo = false, signal?: AbortSignal) =>
  http.get<NepLatest | null>(`/dashboard/nep/latest?deviceId=${deviceId}${demoParam(includeDemo)}`, signal);
export const getOrgDeviceMap = (signal?: AbortSignal) =>
  http.get<FleetMapPoint[]>('/dashboard/org/device-map', signal);

// ── Devices (Month 8) ───────────────────────────────────────────────────────
export interface DevicesQuery {
  type?: DeviceType;
  search?: string;
  page?: number;
  limit?: number;
}
export const listDevices = async (q: DevicesQuery = {}, signal?: AbortSignal): Promise<Page<Device>> => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  const body = await http.getRaw<{ data: Device[]; meta: { page: number; limit: number; total: number; pages: number } }>(
    `/devices${qs ? `?${qs}` : ''}`,
    signal,
  );
  const m = body.meta ?? { page: 1, limit: body.data?.length ?? 0, total: body.data?.length ?? 0, pages: 1 };
  return { rows: body.data ?? [], page: m.page, limit: m.limit, total: m.total, pageCount: m.pages };
};
export const getDevice = (id: string, signal?: AbortSignal) => http.get<Device>(`/devices/${id}`, signal);
export const createDevice = (input: CreateDeviceInput) => http.post<Device>('/devices', input);
export const updateDevice = (id: string, input: UpdateDeviceInput) => http.patch<Device>(`/devices/${id}`, input);
export const deleteDevice = (id: string) => http.delete<void>(`/devices/${id}`);
export const getDeviceStats = (id: string, signal?: AbortSignal) =>
  http.get<DeviceStats>(`/devices/${id}/stats`, signal);
export const getDeviceHealth = (id: string, signal?: AbortSignal) =>
  http.get<DeviceHealth>(`/devices/${id}/health`, signal);
export const getFirmwareHistory = (id: string, signal?: AbortSignal) =>
  http.get<FirmwareHistory>(`/devices/${id}/firmware-history`, signal);
export const getDeviceSettings = (id: string, signal?: AbortSignal) =>
  http.get<DeviceSettings>(`/devices/${id}/settings`, signal);
export const updateDeviceSettings = (id: string, input: DeviceSettingsInput) =>
  http.patch<DeviceSettings>(`/devices/${id}/settings`, input);
export const getFirmwareTargets = (signal?: AbortSignal) =>
  http.get<FirmwareTarget[]>('/devices/firmware-target', signal);
export const setFirmwareTarget = (input: FirmwareTarget) =>
  http.put<FirmwareTarget>('/devices/firmware-target', input);
export const getFirmwareStatus = async (type?: DeviceType, signal?: AbortSignal): Promise<FirmwareStatus> => {
  const qs = type ? `?type=${type}` : '';
  const body = await http.getRaw<{ data: FirmwareStatusRow[]; meta: { total: number; outdated: number } }>(
    `/devices/firmware-status${qs}`,
    signal,
  );
  return { rows: body.data ?? [], total: body.meta?.total ?? 0, outdated: body.meta?.outdated ?? 0 };
};

// ── Analytics (Month 9 — MET deep-dive) ─────────────────────────────────────
/** Shared window for the device-scoped analytics endpoints. */
export interface AnalyticsWindow {
  deviceId: string;
  from?: number;
  to?: number;
  includeDemo?: boolean;
}

function analyticsQs(w: AnalyticsWindow, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams({ deviceId: w.deviceId });
  if (w.from != null) p.set('from', String(w.from));
  if (w.to != null) p.set('to', String(w.to));
  if (w.includeDemo) p.set('includeDemoMode', 'true');
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') p.set(k, v);
  return p.toString();
}

export const getMetWindRoseAgg = (w: AnalyticsWindow, opts: { period?: string; unit?: string } = {}, signal?: AbortSignal) =>
  http.get<MetWindRoseAgg>(`/analytics/met/wind-rose?${analyticsQs(w, { period: opts.period, unit: opts.unit })}`, signal);

export const getMetMultiSensor = (w: AnalyticsWindow, sensors: string[], interval?: string, signal?: AbortSignal) => {
  const base = analyticsQs(w, { interval });
  const list = sensors.map((s) => `sensors[]=${encodeURIComponent(s)}`).join('&');
  return http.get<MetMultiSensor>(`/analytics/met/multi-sensor?${base}&${list}`, signal);
};

export const getMetStatistics = (w: AnalyticsWindow, sensor: string, signal?: AbortSignal) =>
  http.get<MetStatistics>(`/analytics/met/statistics?${analyticsQs(w, { sensor })}`, signal);

// getRaw (NOT get) for the three below: their payloads carry a top-level `data`
// array that the `{ data }`-envelope unwrapper in http.get would wrongly strip.
export const getMetWindGust = (w: AnalyticsWindow, interval?: string, signal?: AbortSignal) =>
  http.getRaw<MetWindGust>(`/analytics/met/wind-gust-history?${analyticsQs(w, { interval })}`, signal);

export const getMetComfort = (w: AnalyticsWindow, interval?: string, signal?: AbortSignal) =>
  http.getRaw<MetComfort>(`/analytics/met/comfort-indices?${analyticsQs(w, { interval })}`, signal);

export const getMetFogRisk = (w: AnalyticsWindow, interval?: string, signal?: AbortSignal) =>
  http.getRaw<MetFogRisk>(`/analytics/met/fog-risk?${analyticsQs(w, { interval })}`, signal);

export const getMetPressureTendency = (deviceId: string, hours?: number, signal?: AbortSignal) =>
  http.get<MetPressureTendency>(
    `/analytics/met/pressure-tendency?deviceId=${deviceId}${hours ? `&hours=${hours}` : ''}`,
    signal,
  );

export const getMetDailySummary = (w: AnalyticsWindow, signal?: AbortSignal) =>
  http.get<MetDailySummary[]>(`/analytics/met/daily-summary?${analyticsQs(w)}`, signal);

// ── Records (Month 9 — MET records) ─────────────────────────────────────────
export interface RecordsQuery {
  deviceId?: string;
  from?: number;
  to?: number;
  page?: number;
  limit?: number;
}

export const listRecords = async (q: RecordsQuery = {}, signal?: AbortSignal): Promise<Page<MetRecordRow>> => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  const body = await http.getRaw<{ data: MetRecordRow[]; meta: { page: number; limit: number; total: number; pages: number } }>(
    `/records${qs ? `?${qs}` : ''}`,
    signal,
  );
  const m = body.meta ?? { page: 1, limit: body.data?.length ?? 0, total: body.data?.length ?? 0, pages: 1 };
  return { rows: body.data ?? [], page: m.page, limit: m.limit, total: m.total, pageCount: m.pages };
};

export const getRecord = (id: string, signal?: AbortSignal) => http.get<MetRecordRow>(`/records/${id}`, signal);

export const getRecordMeasures = async (
  id: string,
  page = 1,
  limit = 1000,
  signal?: AbortSignal,
): Promise<Page<MetMeasureRow>> => {
  const body = await http.getRaw<{ data: MetMeasureRow[]; meta: { page: number; limit: number; total: number; pages: number } }>(
    `/records/${id}/measures?page=${page}&limit=${limit}`,
    signal,
  );
  const m = body.meta ?? { page: 1, limit: body.data?.length ?? 0, total: body.data?.length ?? 0, pages: 1 };
  return { rows: body.data ?? [], page: m.page, limit: m.limit, total: m.total, pageCount: m.pages };
};

/** Same-origin BFF URL for the CSV export (a plain download link; cookie rides along). */
export const recordCsvHref = (id: string) => `/api/records/${id}/export.csv`;

export type { Role };
