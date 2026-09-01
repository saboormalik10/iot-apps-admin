import { http } from './http';
import { uploadWithProgress } from './upload';
import { normalizePage, fullArrayPage, type Page } from './pagination';
import type {
  RoleRow,
  PermissionGroup,
  RoleUsage,
  RoleInput,
  AlertRule,
  AppNotification,
  AuditEntry,
  DashboardDevice,
  DashboardLayout,
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
  ImportSummary,
  MetComfort,
  MetDailySummary,
  MetFogRisk,
  MetHistory,
  MetHistoryMulti,
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
  NepCorrelation,
  NepCrossSessionTrend,
  NepDailySummary,
  NepGpsDensity,
  NepMap,
  NepProbeBreakdown,
  NepSampleRow,
  NepSessionComparison,
  NepSessionEvents,
  NepSessionRow,
  NepTurbidityDistribution,
  NepWaterQuality,
  OrgDeviceComparison,
  FleetHealthRow,
  Organization,
  OrgUser,
  Profile,
  PublicSnapshot,
  PushToken,
  Role,
  SessionFile,
  SessionUser,
  OrganizationSummary,
  PlatformOverview,
  CreateCustomerInput,
  CreatedCustomer,
  PlatformStation,
  ProvisionStationInput,
  ProvisionedStation,
  StreamTypeRow,
  StreamPreview,
  ImportDryRun,
  Branding,
  BrandingInput,
  ShareLink,
  ShareResourceType,
  ShareTokenRow,
} from './types';
import type {
  AlertRuleInput,
  CreateDeviceInput,
  CreateShareInput,
  DeviceSettingsInput,
  InviteUserInput,
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

export interface SummaryScope {
  type?: DeviceType;
  deviceId?: string;
}
export const getSummary = (scope: SummaryScope = {}, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  if (scope.type) params.set('type', scope.type);
  if (scope.deviceId) params.set('deviceId', scope.deviceId);
  const qs = params.toString();
  return http.get<DashboardSummary>(`/dashboard/summary${qs ? `?${qs}` : ''}`, signal);
};
export const getDashboardDevices = (signal?: AbortSignal) =>
  http.get<DashboardDevice[]>(`/dashboard/devices`, signal);
export const getMetLatest = (deviceId: string, signal?: AbortSignal) =>
  http.get<MetLatest | null>(`/dashboard/met/latest?deviceId=${deviceId}`, signal);
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
export const getNepLatest = (deviceId: string, signal?: AbortSignal) =>
  http.get<NepLatest | null>(`/dashboard/nep/latest?deviceId=${deviceId}`, signal);
export const getOrgDeviceMap = (signal?: AbortSignal) =>
  http.get<FleetMapPoint[]>('/dashboard/org/device-map', signal);

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

// ── NEP analytics (Month 10 — deep-dive) ────────────────────────────────────
// Reuses the shared AnalyticsWindow + analyticsQs helpers above.

export const getNepTurbidityDistribution = (w: AnalyticsWindow, signal?: AbortSignal) =>
  http.get<NepTurbidityDistribution>(`/analytics/nep/turbidity-distribution?${analyticsQs(w)}`, signal);

export const getNepProbeBreakdown = (w: AnalyticsWindow, signal?: AbortSignal) =>
  // getRaw: the payload has a top-level `data` array the `{ data }` unwrapper would strip.
  http.getRaw<NepProbeBreakdown>(`/analytics/nep/probe-range-breakdown?${analyticsQs(w)}`, signal);

export const getNepCorrelation = (w: AnalyticsWindow, sessionId?: string, signal?: AbortSignal) =>
  http.get<NepCorrelation>(`/analytics/nep/turbidity-temperature-correlation?${analyticsQs(w, { sessionId })}`, signal);

export const getNepGpsDensity = (
  w: AnalyticsWindow,
  resolution: 'low' | 'medium' | 'high' = 'medium',
  signal?: AbortSignal,
) => http.get<NepGpsDensity>(`/analytics/nep/gps-density?${analyticsQs(w, { resolution })}`, signal);

export const getNepSessionComparison = (sessionIds: string[], signal?: AbortSignal) => {
  const qs = sessionIds.map((id) => `sessionIds[]=${encodeURIComponent(id)}`).join('&');
  return http.get<NepSessionComparison>(`/analytics/nep/session-comparison?${qs}`, signal);
};

export const getNepWaterQuality = (sessionId: string, signal?: AbortSignal) =>
  http.get<NepWaterQuality>(`/analytics/nep/water-quality-summary?sessionId=${encodeURIComponent(sessionId)}`, signal);

export const getNepSessionEvents = (
  sessionId: string,
  opts: { minNtu?: number; eventGapMin?: number } = {},
  signal?: AbortSignal,
) => {
  const p = new URLSearchParams({ sessionId });
  if (opts.minNtu != null) p.set('minNtu', String(opts.minNtu));
  if (opts.eventGapMin != null) p.set('eventGapMin', String(opts.eventGapMin));
  return http.get<NepSessionEvents>(`/analytics/nep/session-events?${p.toString()}`, signal);
};

export const getNepDailySummary = (w: AnalyticsWindow, signal?: AbortSignal) =>
  http.get<NepDailySummary[]>(`/analytics/nep/daily-summary?${analyticsQs(w)}`, signal);

// Cross-session daily trend lives under /dashboard (not /analytics).
export const getNepCrossSessionTrend = (
  params: { deviceId: string; from?: number; to?: number },
  signal?: AbortSignal,
) => {
  const p = new URLSearchParams({ deviceId: params.deviceId });
  if (params.from != null) p.set('from', String(params.from));
  if (params.to != null) p.set('to', String(params.to));
  // getRaw: payload is { deviceId, from, to, data } — a top-level `data` field.
  return http.getRaw<NepCrossSessionTrend>(`/dashboard/nep/analytics?${p.toString()}`, signal);
};

// ── Org rollups (Month 10) ──────────────────────────────────────────────────
export const getOrgDeviceComparison = (
  params: { deviceIds: string[]; sensor: string; from?: number; to?: number; interval?: string; },
  signal?: AbortSignal,
) => {
  const p = new URLSearchParams({ sensor: params.sensor });
  if (params.from != null) p.set('from', String(params.from));
  if (params.to != null) p.set('to', String(params.to));
  if (params.interval) p.set('interval', params.interval);
  const ids = params.deviceIds.map((id) => `deviceIds[]=${encodeURIComponent(id)}`).join('&');
  return http.get<OrgDeviceComparison>(`/analytics/org/device-comparison?${p.toString()}&${ids}`, signal);
};

export const getFleetHealth = (signal?: AbortSignal) =>
  http.get<FleetHealthRow[]>('/analytics/org/fleet-health', signal);

// ── Sessions (Month 10 — NEP sessions module) ───────────────────────────────
export interface SessionsQuery {
  deviceId?: string;
  from?: number;
  to?: number;
  probeRange?: string;
  search?: string;
  page?: number;
  limit?: number;
  /** true → demo-device data ONLY; false/undefined → real-device data only. */
}

export const listSessions = async (q: SessionsQuery = {}, signal?: AbortSignal): Promise<Page<NepSessionRow>> => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  // /dashboard/nep/sessions returns { total, page, limit, sessions } — a bespoke envelope.
  const body = await http.getRaw<{ total: number; page: number; limit: number; sessions: NepSessionRow[] }>(
    `/dashboard/nep/sessions${qs ? `?${qs}` : ''}`,
    signal,
  );
  const rows = body.sessions ?? [];
  const limit = body.limit ?? rows.length ?? 20;
  const total = body.total ?? rows.length;
  return { rows, page: body.page ?? 1, limit, total, pageCount: Math.max(1, Math.ceil(total / (limit || 1))) };
};

export const getNepSession = (id: string, signal?: AbortSignal) =>
  http.get<NepSessionRow>(`/sessions/${id}`, signal);

export const updateSessionComment = (id: string, comment: string) =>
  http.patch<NepSessionRow>(`/sessions/${id}`, { comment });

export const getSessionSamples = async (
  id: string,
  opts: { page?: number; limit?: number; downsample?: boolean } = {},
  signal?: AbortSignal,
): Promise<Page<NepSampleRow> & { downsampled: boolean }> => {
  const p = new URLSearchParams();
  if (opts.page) p.set('page', String(opts.page));
  if (opts.limit) p.set('limit', String(opts.limit));
  if (opts.downsample) p.set('downsample', 'true');
  const qs = p.toString();
  const body = await http.getRaw<{
    data: NepSampleRow[];
    meta: { page: number; limit: number; total: number; pages: number; downsampled?: boolean };
  }>(`/sessions/${id}/samples${qs ? `?${qs}` : ''}`, signal);
  const m = body.meta ?? { page: 1, limit: body.data?.length ?? 0, total: body.data?.length ?? 0, pages: 1 };
  return {
    rows: body.data ?? [],
    page: m.page,
    limit: m.limit,
    total: m.total,
    pageCount: m.pages,
    downsampled: Boolean(m.downsampled),
  };
};

export const getSessionTrail = (sessionId: string, signal?: AbortSignal) =>
  http.get<NepMap>(`/dashboard/nep/map?sessionId=${encodeURIComponent(sessionId)}`, signal);

export const listSessionFiles = (id: string, signal?: AbortSignal) =>
  http.get<SessionFile[]>(`/sessions/${id}/files`, signal);

export const deleteSessionFile = (sessionId: string, fileId: string) =>
  http.delete<void>(`/sessions/${sessionId}/files/${fileId}`);

/** Same-origin BFF URL for the session CSV export (plain download; cookie rides along). */
export const sessionCsvHref = (id: string) => `/api/sessions/${id}/export.csv`;

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
/** Admin push-token registry — GET /notifications/tokens returns the full array. */
export const listPushTokens = (signal?: AbortSignal) =>
  http.get<PushToken[]>('/notifications/tokens', signal);

// ── Share links (Month 11) ──────────────────────────────────────────────────
export const createShare = (input: CreateShareInput) => http.post<ShareLink>('/share', input);
export const listShares = async (
  q: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<Page<ShareTokenRow>> => {
  const params = new URLSearchParams();
  if (q.page) params.set('page', String(q.page));
  if (q.limit) params.set('limit', String(q.limit));
  const qs = params.toString();
  const body = await http.getRaw<{ data: ShareTokenRow[]; pagination: unknown }>(
    `/share${qs ? `?${qs}` : ''}`,
    signal,
  );
  return normalizePage<ShareTokenRow>(body as never);
};
export const revokeShare = (id: string) => http.delete<void>(`/share/${id}`);
export type { ShareResourceType };

/** Unauthenticated public snapshot — hits the dedicated /api/public/:token BFF route (no session). */
export const getPublicSnapshot = async (token: string, signal?: AbortSignal): Promise<PublicSnapshot> => {
  const res = await fetch(`/api/public/${encodeURIComponent(token)}`, {
    credentials: 'omit',
    headers: { 'x-requested-with': 'fetch' },
    signal,
  });
  if (!res.ok) {
    const err = new Error('Shared link not found or has expired.') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const body = (await res.json()) as { data: PublicSnapshot } | PublicSnapshot;
  return 'data' in (body as Record<string, unknown>) ? (body as { data: PublicSnapshot }).data : (body as PublicSnapshot);
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

/**
 * `POST /import/{nep,met}` — multipart (`file` + `deviceId`), admin-only. There is
 * no server dry-run: the wizard predicts the outcome client-side (see
 * features/import/csv-contract.ts) and this call always commits. NEP is
 * idempotent per SessionId; MET creates one MetRecord per file.
 * Rides the XHR uploader so the wizard can show real upload progress.
 */
export const importCsv = (
  kind: 'nep' | 'met',
  file: File,
  deviceId: string,
  opts?: { onProgress?: (fraction: number) => void; signal?: AbortSignal },
) => {
  const form = new FormData();
  form.append('file', file);
  form.append('deviceId', deviceId);
  return uploadWithProgress<ImportSummary>(`/import/${kind}`, form, opts ?? {});
};

/**
 * Same-origin BFF URL for the batch ZIP export (a plain download link; the BFF
 * streams the archive and forwards content-disposition). `deviceId` is required —
 * the backend has no fleet-wide export (§17: default-device + comparison instead).
 */
export const sessionsZipHref = (q: { deviceId: string; from?: number; to?: number }) => {
  const p = new URLSearchParams({ deviceId: q.deviceId });
  if (q.from !== undefined) p.set('from', String(q.from));
  if (q.to !== undefined) p.set('to', String(q.to));
  return `/api/export/sessions.zip?${p.toString()}`;
};


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

/** Every customer organisation. Platform administrators only (403 otherwise). */
export const listOrganizations = (signal?: AbortSignal) =>
  http.get<OrganizationSummary[]>('/organizations', signal);

/** Cross-customer overview. Platform administrators only (403 otherwise). */
export const getPlatformOverview = (signal?: AbortSignal) =>
  http.get<PlatformOverview>('/platform/overview', signal);

/** Create a customer and its first administrator. Platform administrators only. */
export const createCustomer = (input: CreateCustomerInput) =>
  http.post<CreatedCustomer>('/platform/customers', input);

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

/** Stations for a customer. Platform administrators only. */
export const listStations = (organizationId: string, signal?: AbortSignal) =>
  http.get<PlatformStation[]>(`/platform/stations/${organizationId}`, signal);

export const provisionStation = (input: ProvisionStationInput) =>
  http.post<ProvisionedStation>('/platform/stations', input);

/**
 * Collect a provisioning job's SFTP password — ONCE.
 *
 * The password is generated on the box, handed back, and never stored. It is
 * readable exactly once and expires after 15 minutes whether it is read or not,
 * so the caller must show it immediately. `collected: false` means it is already
 * gone, and the only way back is a rotation.
 *
 * Until M24 nothing in the panel called this, so a provisioned station's
 * credentials were unreachable: the dialog moved from "Waiting for the agent" to
 * "Receiving" and the password expired unread.
 */
export const collectStationSecret = (jobId: string) =>
  http.post<{ password: string | null; collected: boolean }>(`/platform/stations/secret/${jobId}`, {});

/** Rotate a station's SFTP password. Returns a job whose secret is collected as above. */
export const rotateStationPassword = (stationAccountId: string) =>
  http.post<{ jobId: string; account: string; status: string }>(
    `/platform/stations/${stationAccountId}/rotate`,
    {},
  );

/** Stream types with their column specs. Platform administrators only. */
export const listStreamTypes = (signal?: AbortSignal) =>
  http.get<StreamTypeRow[]>('/platform/stream-types', signal);

/** Parse a sample and report what WOULD be stored. Writes nothing. */
export const previewStream = (input: { streamKey: string; content: string; filename?: string }) =>
  http.post<StreamPreview>('/platform/stream-types/preview', input);

export const setStreamTypeEnabled = (id: string, isEnabled: boolean) =>
  http.patch<{ id: string; key: string; isEnabled: boolean }>(`/platform/stream-types/${id}/enabled`, { isEnabled });

/**
 * Ask the server what a MET import would do. Writes nothing.
 *
 * The wizard's own review is computed in the browser and cannot know two things
 * the server does: whether these exact bytes were already ingested, and which
 * local days already hold data.
 */
export const dryRunMetImport = (file: File, deviceId: string) => {
  const form = new FormData();
  form.append('file', file);
  form.append('deviceId', deviceId);
  return http.post<ImportDryRun>('/import/met/dry-run', form);
};
