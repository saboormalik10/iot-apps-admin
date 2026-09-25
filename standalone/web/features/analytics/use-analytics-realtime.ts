'use client';

import { useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent, useOnReconnect } from '@/lib/realtime/hooks';
import { ClientEvent } from '@/lib/realtime/events';
import { queryKeys } from '@/lib/query/keys';

/**
 * Wires the MET analytics suite to the socket (plan §3.2, §Month 9). The rule is
 * "refetch is truth": live MET events invalidate the analytics query keys rather
 * than hand-patching caches, and — because those keys are built from the memoized
 * Scope Bar window — invalidation refetches the SAME key (no loop). No polling.
 *
 * `met:windrose` fires with every measure batch, so its invalidation is debounced.
 */
export function useAnalyticsRealtime() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const invalidateMet = () => qc.invalidateQueries({ queryKey: queryKeys.analytics.met });

  useSocketEvent(ClientEvent.MET_LATEST, invalidateMet);

  useSocketEvent(ClientEvent.MET_WINDROSE, () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(invalidateMet, 1500);
  });

  // After a reconnect, the truth is whatever the server returns now.
  useOnReconnect(invalidateMet);

  useEffect(() => () => clearTimeout(timer.current), []);
}
