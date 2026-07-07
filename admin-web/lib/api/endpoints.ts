import { http } from './http';
import { normalizePage, fullArrayPage, type Page } from './pagination';
import type {
  AppNotification,
  AuditEntry,
  Organization,
  OrgUser,
  Profile,
  Role,
  SessionUser,
} from './types';
import type { InviteUserInput, UpdateOrgInput, UpdateUserInput } from './schemas';

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

export type { Role };
