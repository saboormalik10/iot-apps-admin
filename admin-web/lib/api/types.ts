/**
 * Domain types for the Month-7 API surface. Hand-authored from the backend
 * Swagger (audience: 🖥️ Admin Panel). The CI `check-contract` script asserts the
 * paths/methods the client depends on still exist in the live spec (drift check),
 * so these types can't silently rot against the backend.
 */

export type Role = 'admin' | 'operator' | 'viewer';

/** Compact user identity returned by login / accept-invite. */
export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string;
}

/** Full profile — GET/PATCH /users/me. */
export interface Profile extends SessionUser {
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Org member row — GET /organizations/me/users (returned as a full array). */
export interface OrgUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  invitedAt: string | null;
}

/** GET/PATCH /organizations/me. */
export interface Organization {
  id: string;
  name: string;
  slug?: string;
  contactEmail?: string;
  country: string;
  timezone: string;
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'invite'
  | 'revoke'
  | 'export'
  | 'login'
  | 'logout';

export type AuditResourceType =
  | 'device'
  | 'user'
  | 'session'
  | 'record'
  | 'alertRule'
  | 'shareToken'
  | 'org'
  | 'settings';

export interface AuditEntry {
  _id: string;
  userEmail: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  resourceName: string | null;
  changes: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
}

export type NotificationKind = 'alert' | 'session_complete' | 'firmware';

export interface AppNotification {
  _id: string;
  type: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/** Login / accept-invite response body (before the BFF strips the tokens). */
export interface AuthResult {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}
