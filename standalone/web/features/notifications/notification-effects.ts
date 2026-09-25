import type { QueryClient } from '@tanstack/react-query';
import type { NotificationKind } from '@/lib/api/types';

/**
 * The "refetch is truth" rule (plan §3.2). An alert arrives as `notification:new`,
 * so the bell/feed handler must also refresh the alert-rules list (its trigger
 * history changed), not merely bump the badge. Notifications themselves are always
 * refetched by the caller.
 */
export function invalidateForNotification(
  qc: QueryClient,
  payload: { type?: NotificationKind; data?: Record<string, unknown> | null } | undefined,
): void {
  if (payload?.type === 'alert') {
    qc.invalidateQueries({ queryKey: ['alert-rules'] });
  }
}
