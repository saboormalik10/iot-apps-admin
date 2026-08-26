'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent, type MetLatestPayload } from '@/lib/realtime/events';
import type { MetLatest } from '@/lib/api/types';
import { queryKeys } from '@/lib/query/keys';

/**
 * Wires the dashboard's live surfaces to socket events (plan §3.2).
 *
 * "Refetch is truth" still holds for anything the socket cannot fully describe —
 * histories, the wind rose, device lists. But `met:latest` now carries the whole
 * reading, so it is applied DIRECTLY to the cached value instead of being thrown
 * away and re-fetched. The station reports once a minute; waiting a round trip to
 * display a number already in hand made the live dial lag its own event.
 *
 * The patch is a MERGE, not a replace: the payload is a subset of `MetLatest` and
 * omits the fields that do not change (deviceName, headingOffsetDeg). Replacing
 * would blank them.
 */
export function useDashboardRealtime(deviceIds: { met?: string; nep?: string }) {
  const qc = useQueryClient();
  const windroseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useSocketEvent<MetLatestPayload>(ClientEvent.MET_LATEST, (payload) => {
    if (deviceIds.met) {
      // Apply the pushed reading straight to the cache. Guarded on there being
      // something to merge INTO: seeding a partial object before the first fetch
      // would render a reading with no device name and no calibration state.
      if (payload && typeof payload.measuredAtMs === 'number') {
        qc.setQueryData<MetLatest | null>(queryKeys.metLatest(deviceIds.met), (prev) =>
          prev
            ? {
                ...prev,
                ...payload,
                measuredAt: new Date(payload.measuredAtMs).toISOString(),
              }
            : prev,
        );
      }
      // NOTE: metLatest is deliberately NOT invalidated here. The patch above
      // already holds every field that changes, so a refetch would overwrite it
      // with identical data and cost a round trip per minute per viewer. A missed
      // event is recovered by <RealtimeCatchup> on reconnect or tab-return.
      //
      // The histories DO need the server — a single reading cannot extend a series.
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
