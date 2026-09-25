'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeCatchup } from '@/lib/realtime/use-realtime-catchup';
import { LIVE_QUERY_ROOTS } from '@/lib/realtime/live-query-roots';

/**
 * App-wide realtime catch-up (plan §Month 11 hardening). Mounted once inside the
 * authenticated shell, it reconciles EVERY live surface — current and future — on
 * reconnect and on tab-return, invalidating only the live query roots. Renders
 * nothing. Per-surface hooks still handle live-while-connected event → key pushes;
 * this centralizes the "did we miss something?" refetch so each page doesn't
 * reinvent it (and covers the backgrounded-tab gap uniformly).
 */
export function RealtimeCatchup() {
  const qc = useQueryClient();
  useRealtimeCatchup(() => {
    for (const key of LIVE_QUERY_ROOTS) qc.invalidateQueries({ queryKey: key });
  });
  return null;
}
