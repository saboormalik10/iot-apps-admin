'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent } from '@/lib/realtime/events';
import { queryKeys } from '@/lib/query/keys';

/**
 * Wires the NEP analytics suite to the socket (plan §3.2, §Month 10). "Refetch is
 * truth": live NEP events invalidate the NEP analytics query keys rather than
 * hand-patching caches. Because those keys are built from the memoized Scope Bar
 * window, invalidation refetches the SAME key — no loop, no polling.
 *
 * - `nep:sample` → a session's turbidity stream advanced.
 * - `nep:session:created` → a new session (distribution/comparison/trend shift).
 */
export function useNepAnalyticsRealtime() {
  const qc = useQueryClient();
  const invalidateNep = () => qc.invalidateQueries({ queryKey: queryKeys.analytics.nep });

  useSocketEvent(ClientEvent.NEP_SAMPLE, invalidateNep);
  useSocketEvent(ClientEvent.NEP_SESSION_CREATED, invalidateNep);
  // Reconnect / tab-return catch-up is centralized in <RealtimeCatchup> (it
  // refetches the ['analytics'] root, covering the NEP suite) — §Month 11 hardening.
}
