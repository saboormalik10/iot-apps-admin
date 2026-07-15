import type { QueryClient } from '@tanstack/react-query';
import type { NotificationKind } from '@/lib/api/types';
import { queryKeys } from '@/lib/query/keys';

/**
 * The "refetch is truth" rule (plan §3.2). Two of the three notification types
 * carry a real state change but have NO dedicated socket event — they arrive only
 * as `notification:new`, so the bell/feed handler must invalidate the affected
 * queries, not merely bump the badge:
 *   - session_complete → the sessions list + that session's detail (its avg/min/max
 *     are only now final);
 *   - firmware → firmware-status + fleet-health + that device's detail (the outdated
 *     flag may have just flipped);
 *   - alert → the alert-rules list (trigger history changed).
 * Notifications themselves are always refetched by the caller.
 */
export function invalidateForNotification(
  qc: QueryClient,
  payload: { type?: NotificationKind; data?: Record<string, unknown> | null } | undefined,
): void {
  const type = payload?.type;
  const data = payload?.data ?? {};
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

  if (type === 'session_complete') {
    qc.invalidateQueries({ queryKey: ['sessions'] });
    const sessionId = str(data.sessionId);
    if (sessionId) qc.invalidateQueries({ queryKey: queryKeys.nepSession(sessionId) });
  } else if (type === 'firmware') {
    qc.invalidateQueries({ queryKey: ['devices', 'firmware-status'] });
    qc.invalidateQueries({ queryKey: queryKeys.analytics.fleetHealth });
    const deviceId = str(data.deviceId);
    if (deviceId) qc.invalidateQueries({ queryKey: queryKeys.device(deviceId) });
  } else if (type === 'alert') {
    qc.invalidateQueries({ queryKey: ['alert-rules'] });
  }
}
