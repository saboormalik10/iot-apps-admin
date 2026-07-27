'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent } from '@/lib/realtime/events';
import { queryKeys } from '@/lib/query/keys';

/**
 * Wires the dashboard's live surfaces to socket events (plan §3.2). The rule is
 * "refetch is truth": events invalidate the relevant query keys rather than
 * hand-patching caches. `met:windrose` fires with EVERY met:latest batch, so its
 * invalidation is debounced.
 */
export function useDashboardRealtime(deviceIds: { met?: string; nep?: string }) {
  const qc = useQueryClient();
  const windroseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useSocketEvent(ClientEvent.MET_LATEST, () => {
    if (deviceIds.met) {
      qc.invalidateQueries({ queryKey: queryKeys.metLatest(deviceIds.met) });
      // Both the single-sensor 'history' key and the graph stack's 'history-multi'
      // key (the two are sibling prefixes, so neither matches the other).
      qc.invalidateQueries({ queryKey: ['dashboard', 'met', 'history'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'met', 'history-multi'] });
    }
  });

  useSocketEvent(ClientEvent.MET_WINDROSE, () => {
    if (!deviceIds.met) return;
    clearTimeout(windroseTimer.current);
    windroseTimer.current = setTimeout(() => {
      qc.invalidateQueries({ queryKey: queryKeys.metWindrose(deviceIds.met!) });
    }, 1500);
  });

  useSocketEvent(ClientEvent.NEP_SAMPLE, () => {
    if (deviceIds.nep) qc.invalidateQueries({ queryKey: queryKeys.nepLatest(deviceIds.nep) });
  });

  useSocketEvent(ClientEvent.DEVICE_STATUS, () => {
    qc.invalidateQueries({ queryKey: queryKeys.dashboardDevices });
    qc.invalidateQueries({ queryKey: queryKeys.orgDeviceMap });
    qc.invalidateQueries({ queryKey: queryKeys.summary });
  });
  useSocketEvent(ClientEvent.DEVICE_CONNECTED, () => {
    qc.invalidateQueries({ queryKey: queryKeys.dashboardDevices });
    qc.invalidateQueries({ queryKey: queryKeys.orgDeviceMap });
  });

  // Alerts / session-complete / firmware arrive as notification:new → the bell
  // (Month 7) already refetches the feed; here we also refresh the summary tiles.
  useSocketEvent(ClientEvent.ALERT_TRIGGERED, () => qc.invalidateQueries({ queryKey: queryKeys.summary }));

  // Reconnect / tab-return catch-up is centralized in <RealtimeCatchup> (§Month 11
  // hardening): it refetches the live query roots (incl. dashboard) — scoped, so a
  // reconnect no longer nukes static caches, and it also covers backgrounded tabs.

  useEffect(() => () => clearTimeout(windroseTimer.current), []);
}
