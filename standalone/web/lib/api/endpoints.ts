import { http } from './http';
import { normalizePage, fullArrayPage, type Page } from './pagination';
import type {
  AlertRule,
  QueryColumnsInfo,
  QueryResolution,
  QueryResult,
  RainSummary,
  SystemStatus,
  AlertTimeline,
  AppNotification,
  AuditEntry,
  Branding,
  BrandingInput,
  DisplayUnits,
  DisplayUnitsInput,
  DashboardDevice,
  DashboardLayout,
  DashboardSummary,
  Device,
  DeviceHealth,
  DeviceType,
  MetComfort,
  MetDailySummary,
  MetFogRisk,
  MetHistory,
  MetHistoryMulti,
  MetLatest,
  MetMeasureRow,
  MetMultiSensor,
  MetPressureTendency,
  MetRangeSummary,
  MetRecordRow,
  MetStatistics,
  MetWindGust,
  MetMeanWind,
  MetWindRoseAgg,
  MetWindrose,
  OrgUser,
  Organization,
  PermissionGroup,
  Profile,
  Role,
  RoleInput,
  RoleRow,
  RoleUsage,
  SessionUser,
} from './types';
import type {
  AlertRuleInput,
  CreateUserInput,
  UpdateAlertRuleInput,
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
export const updateUser = (id: string, input: UpdateUserInput) =>
  http.patch<OrgUser>(`/organizations/me/users/${id}`, input);
export const createUser = (input: CreateUserInput) =>
  http.post<OrgUser>('/organizations/me/users', input);
export const removeUser = (id: string) => http.delete<void>(`/organizations/me/users/${id}`);
/** An admin sets someone's password; they choose their own at next sign-in. */
export const resetUserPassword = (id: string, password: string) =>
  http.post<OrgUser>(`/organizations/me/users/${id}/password`, { password });

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

export interface SummaryScope {
  type?: DeviceType;
  deviceId?: string;
  /** Scope-bar window. Narrows the data tiles only — see `getSummary`. */
  from?: number;
  to?: number;
}

export const getSummary = (scope: SummaryScope = {}, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  if (scope.type) params.set('type', scope.type);
  if (scope.deviceId) params.set('deviceId', scope.deviceId);
  // The window narrows the DATA tiles only; the server leaves device and alert
  // counts as current state. Omitted means all time.
  if (scope.from != null) params.set('from', String(scope.from));
  if (scope.to != null) params.set('to', String(scope.to));
  const qs = params.toString();
  return http.get<DashboardSummary>(`/dashboard/summary${qs ? `?${qs}` : ''}`, signal);
};
export const getDashboardDevices = (signal?: AbortSignal) =>
  http.get<DashboardDevice[]>(`/dashboard/devices`, signal);
export const getMetLatest = (deviceId: string, signal?: AbortSignal) =>
  http.get<MetLatest | null>(`/dashboard/met/latest?deviceId=${deviceId}`, signal);

export const getMetRangeSummary = (
  params: { deviceId: string; sensor: string; from: number; to: number },
  signal?: AbortSignal,
) =>
  http.get<MetRangeSummary>(
    `/analytics/met/range-summary?deviceId=${params.deviceId}&sensor=${params.sensor}` +
      `&from=${params.from}&to=${params.to}`,
    signal,
  );
export const getMetWindrose = (deviceId: string, signal?: AbortSignal) =>
  http.get<MetWindrose>(`/dashboard/met/windrose?deviceId=${deviceId}`, signal);
export const getMetHistory = (
  params: { deviceId: string; sensor: string; from: number; to: number; },
  signal?: AbortSignal,
) => {
  const qs = new URLSearchParams({
    deviceId: params.deviceId,
    sensor: params.sensor,
    from: String(params.from),
    to: String(params.to),
  });
  // getRaw (NOT get): the payload itself has a top-level `data` array, which the
  // `{ data }`-envelope unwrapper in http.get would wrongly strip to just the array.
  return http.getRaw<MetHistory>(`/dashboard/met/history?${qs.toString()}`, signal);
};
export const getMetHistoryMulti = (
  params: { deviceId: string; sensors: string[]; from: number; to: number; },
  signal?: AbortSignal,
) => {
  const qs = new URLSearchParams({
    deviceId: params.deviceId,
    sensors: params.sensors.join(','),
    from: String(params.from),
    to: String(params.to),
  });
  return http.getRaw<MetHistoryMulti>(`/dashboard/met/history-multi?${qs.toString()}`, signal);
};

// ── Devices (Month 8) ───────────────────────────────────────────────────────
export interface DevicesQuery {
  type?: DeviceType;
  search?: string;
  page?: number;
  limit?: number;
  /** true → demo-device data ONLY; false/undefined → real-device data only. */
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
export const updateDevice = (id: string, input: UpdateDeviceInput) => http.patch<Device>(`/devices/${id}`, input);
export const getDeviceHealth = (id: string, signal?: AbortSignal) =>
  http.get<DeviceHealth>(`/devices/${id}/health`, signal);

// ── Analytics (Month 9 — MET deep-dive) ─────────────────────────────────────
/** Shared window for the device-scoped analytics endpoints. */
export interface AnalyticsWindow {
  deviceId: string;
  from?: number;
  to?: number;
}

function analyticsQs(w: AnalyticsWindow, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams({ deviceId: w.deviceId });
  // Always send `from` (default 0 = no lower bound). Omitting it makes the backend
  // fall back to "last 24h", which silently truncates the "All time" preset.
  p.set('from', String(w.from ?? 0));
  if (w.to != null) p.set('to', String(w.to));
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
export const getMetMeanWind = (w: AnalyticsWindow, signal?: AbortSignal) =>
  http.getRaw<MetMeanWind>(`/analytics/met/mean-wind?${analyticsQs(w)}`, signal);
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
  /** true → demo-device data ONLY; false/undefined → real-device data only. */
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

/**
 * Bucketed series for the record chart.
 *
 * Equal-width buckets across the window, one averaged point each — NOT the first
 * N raw rows. At 1 Hz those first N covered half an hour, so a channel logged
 * once a minute contributed a stub at the left edge and read as "no data".
 */
export const getRecordSeries = async (
  id: string,
  fields: string[],
  window?: { from?: number; to?: number },
  points = 500,
  signal?: AbortSignal,
): Promise<{ data: Array<Record<string, number | null>>; intervalMs: number; fields: string[] }> => {
  const qs = new URLSearchParams({ fields: fields.join(','), points: String(points) });
  if (window?.from !== undefined) qs.set('from', String(window.from));
  if (window?.to !== undefined) qs.set('to', String(window.to));
  return http.get<{ data: Array<Record<string, number | null>>; intervalMs: number; fields: string[] }>(
    `/records/${id}/series?${qs.toString()}`,
    signal,
  );
};

export const getRecordMeasures = async (
  id: string,
  page = 1,
  limit = 1000,
  window?: { from?: number; to?: number },
  signal?: AbortSignal,
): Promise<Page<MetMeasureRow>> => {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  // Only sent when bounded. An "All time" scope has no `from`, and sending an
  // empty one would be read as a lower bound of 1970.
  if (window?.from !== undefined) qs.set('from', String(window.from));
  if (window?.to !== undefined) qs.set('to', String(window.to));
  const body = await http.getRaw<{ data: MetMeasureRow[]; meta: { page: number; limit: number; total: number; pages: number } }>(
    `/records/${id}/measures?${qs.toString()}`,
    signal,
  );
  const m = body.meta ?? { page: 1, limit: body.data?.length ?? 0, total: body.data?.length ?? 0, pages: 1 };
  return { rows: body.data ?? [], page: m.page, limit: m.limit, total: m.total, pageCount: m.pages };
};

/** Same-origin BFF URL for the CSV export (a plain download link; cookie rides along). */
export const recordCsvHref = (id: string) => `/api/records/${id}/export.csv`;

// ── NEP analytics (Month 10 — deep-dive) ────────────────────────────────────
// Reuses the shared AnalyticsWindow + analyticsQs helpers above.

// ── Alert rules (Month 11) ──────────────────────────────────────────────────
export interface AlertRulesQuery {
  deviceId?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
export const listAlertRules = async (q: AlertRulesQuery = {}, signal?: AbortSignal): Promise<Page<AlertRule>> => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  // { data, pagination:{page,limit,total,totalPages} } — normalize via getRaw.
  const body = await http.getRaw<{ data: AlertRule[]; pagination: unknown }>(
    `/alert-rules${qs ? `?${qs}` : ''}`,
    signal,
  );
  return normalizePage<AlertRule>(body as never);
};
export const getAlertRule = (id: string, signal?: AbortSignal) =>
  http.get<AlertRule>(`/alert-rules/${id}`, signal);
export const createAlertRule = (input: AlertRuleInput) => http.post<AlertRule>('/alert-rules', input);
export const updateAlertRule = (id: string, input: UpdateAlertRuleInput) =>
  http.patch<AlertRule>(`/alert-rules/${id}`, input);
export const deleteAlertRule = (id: string) => http.delete<void>(`/alert-rules/${id}`);

/**
 * Minute-by-minute account of what a rule saw and why it did or did not fire.
 * `at` centres the window on that instant (a trigger time); omit it for a
 * window ending now.
 */
export const getAlertTimeline = (
  id: string,
  q: { minutes?: number; at?: number } = {},
  signal?: AbortSignal,
): Promise<AlertTimeline> => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null) params.set(k, String(v));
  const qs = params.toString();
  return http.get<AlertTimeline>(`/alert-rules/${id}/timeline${qs ? `?${qs}` : ''}`, signal);
};

// ── Notifications feed + push-token registry (Month 11) ─────────────────────
export const listNotificationsPage = async (
  opts: { unread?: boolean; page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<NotificationsResult> => {
  const params = new URLSearchParams();
  if (opts.unread) params.set('unread', 'true');
  if (opts.page) params.set('page', String(opts.page));
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const body = await http.getRaw<{ data: AppNotification[]; pagination: unknown; unreadCount: number }>(
    `/notifications${qs ? `?${qs}` : ''}`,
    signal,
  );
  return { page: normalizePage<AppNotification>(body as never), unreadCount: body.unreadCount ?? 0 };
};

// ── Dashboard presets (Month 11 — per-device saved layouts) ─────────────────
export interface CreateLayoutInput {
  deviceId: string;
  name?: string;
  tiles: DashboardLayout['tiles'];
  isDefault?: boolean;
}
export const listDashboardLayouts = (deviceId?: string, signal?: AbortSignal) =>
  http.get<DashboardLayout[]>(`/dashboard-layouts${deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''}`, signal);
export const createDashboardLayout = (input: CreateLayoutInput) =>
  http.post<DashboardLayout>('/dashboard-layouts', input);
export const updateDashboardLayout = (id: string, input: { name?: string; tiles?: DashboardLayout['tiles'] }) =>
  http.patch<DashboardLayout>(`/dashboard-layouts/${id}`, input);
export const deleteDashboardLayout = (id: string) => http.delete<void>(`/dashboard-layouts/${id}`);
export const setDefaultDashboardLayout = (id: string) =>
  http.patch<DashboardLayout>(`/dashboard-layouts/${id}/set-default`, {});

export type { Role };

// ── Import + batch export (Month 12) ────────────────────────────────────────

// ── Roles (M18) ─────────────────────────────────────────────────────────────
export const listRoles = (signal?: AbortSignal) => http.get<RoleRow[]>('/roles', signal);
export const listPermissionGroups = (signal?: AbortSignal) => http.get<PermissionGroup[]>('/roles/permissions', signal);
export const getRoleUsage = (id: string, signal?: AbortSignal) => http.get<RoleUsage>(`/roles/${id}/usage`, signal);
export const createRole = (input: RoleInput) => http.post<RoleRow>('/roles', input);
export const updateRole = (id: string, input: Partial<RoleInput>) => http.patch<RoleRow>(`/roles/${id}`, input);
export const deleteRole = (id: string, replacementRoleId?: string) =>
  http.delete<{ deleted: string; usersMoved: number; replacementRoleId: string | null }>(
    `/roles/${id}${replacementRoleId ? `?replacementRoleId=${encodeURIComponent(replacementRoleId)}` : ''}`,
  );

export const getDisplayUnits = (signal?: AbortSignal) =>
  http.get<DisplayUnits>('/organizations/me/display-units', signal);
export const updateDisplayUnits = (input: DisplayUnitsInput) =>
  http.patch<DisplayUnits>('/organizations/me/display-units', input);

export const getBranding = (signal?: AbortSignal) => http.get<Branding>('/organizations/me/branding', signal);
export const updateBranding = (input: BrandingInput) => http.patch<Branding>('/organizations/me/branding', input);

/**
 * Upload a logo.
 *
 * Reuses the same multipart path as the CSV import — `http` detects `FormData`
 * and leaves the Content-Type alone, because setting it by hand strips the
 * multipart boundary and the server then sees no file at all.
 */
export const uploadLogo = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return http.post<Branding>('/organizations/me/branding/logo', form);
};

export const removeLogo = () => http.delete<Branding>('/organizations/me/branding/logo');

// ── Query screen (standalone Phase 4) ───────────────────────────────────────
export interface QueryParams {
  deviceId: string;
  from: number;
  to: number;
  fields: string[];
  resolution: QueryResolution;
  page?: number;
  limit?: number;
}

function queryQs(p: QueryParams, withPaging: boolean): string {
  const qs = new URLSearchParams({
    deviceId: p.deviceId,
    from: String(p.from),
    to: String(p.to),
    fields: p.fields.join(','),
    resolution: p.resolution,
  });
  if (withPaging && p.page) qs.set('page', String(p.page));
  if (withPaging && p.limit) qs.set('limit', String(p.limit));
  return qs.toString();
}

export const getQueryColumns = (deviceId: string, signal?: AbortSignal) =>
  http.get<QueryColumnsInfo>(`/query/columns?deviceId=${encodeURIComponent(deviceId)}`, signal);
export const runQuery = (p: QueryParams, signal?: AbortSignal) =>
  http.get<QueryResult>(`/query/measures?${queryQs(p, true)}`, signal);
/** A plain link: the browser downloads the streamed file through the BFF with the session cookie. */
export const queryCsvHref = (p: QueryParams) => `/api/query/measures.csv?${queryQs(p, false)}`;

// ── Rain (standalone Phase 4) ───────────────────────────────────────────────
/** The site PC's health — the System page. */
export const getSystemStatus = (signal?: AbortSignal) => http.get<SystemStatus>('/system/status', signal);

export const getMetRain = (deviceId: string, signal?: AbortSignal) =>
  http.get<RainSummary>(`/dashboard/met/rain?deviceId=${encodeURIComponent(deviceId)}`, signal);
