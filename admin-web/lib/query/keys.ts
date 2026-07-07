import type { AuditQuery } from '../api/endpoints';

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
};
