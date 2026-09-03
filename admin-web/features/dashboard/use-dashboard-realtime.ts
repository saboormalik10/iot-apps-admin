'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeviceSubscription, useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent, type MetLatestPayload } from '@/lib/realtime/events';
import type { MetLatest, MetRangeSummary } from '@/lib/api/types';
import { queryKeys } from '@/lib/query/keys';
import { useScope } from '@/lib/hooks/use-scope';

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
  const { window } = useScope();

  /**
   * Join the device rooms.
   *
   * `met:latest` is emitted with `server.to(roomForDevice(deviceId))`, so a client
   * that never sends `subscribe:device` is not in the room and receives NOTHING.
   * The dashboard mounted this hook and registered handlers but never subscribed,
   * so every listener below was dead on this page — the panel only ever changed on
   * a refetch or a remount, which is precisely why the live values looked stuck.
   *
   * The device-detail screen has always subscribed, which is why the push worked
   * there and hid the gap here.
   */
  useDeviceSubscription(deviceIds.met);
  useDeviceSubscription(deviceIds.nep);
  const windroseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useSocketEvent<MetLatestPayload>(ClientEvent.MET_LATEST, (payload) => {
    if (deviceIds.met) {
      // Apply the pushed reading straight to the cache. Guarded on there being
      // something to merge INTO: seeding a partial object before the first fetch
      // would render a reading with no device name and no calibration state.
      if (payload && typeof payload.measuredAtMs === 'number') {
        const patch = (key: readonly unknown[]) =>
          qc.setQueryData<MetLatest | null>(key, (prev) =>
            prev
              ? {
                  ...prev,
                  ...payload,
                  measuredAt: new Date(payload.measuredAtMs as number).toISOString(),
                }
              : prev,
          );

        patch(queryKeys.metLatest(deviceIds.met));

        /**
         * Keep the range summary's MAX honest without refetching it.
         *
         * Invalidating a summary spanning hours or days on every reading would be
         * a round trip per reading, and the mean it returns would not visibly move
         * for any single one of them. The maximum is different: a new peak is
         * exactly the number an operator watches for, and it must not wait.
         *
         * Raised in place when a reading beats it; mean and count follow on the
         * next natural refetch. Monotonic within a window, which is what a maximum
         * is.
         */
        const from = window.from ?? 0;
        // `window.to` is quantised DOWN to the minute (so the query key is stable
        // and does not refetch every render). A reading that just arrived is
        // therefore often LATER than it — by up to 59 seconds — and a naive
        // `<= window.to` would silently drop exactly the readings this patch
        // exists for. Every preset is a rolling window ending "now", so the real
        // upper bound is now.
        const upper = Math.max(window.to, Date.now());
        const inWindow = payload.measuredAtMs >= from && payload.measuredAtMs <= upper;
        if (inWindow && typeof payload.windSpeedMs === 'number') {
          const speed = payload.windSpeedMs;
          qc.setQueryData<MetRangeSummary | undefined>(
            queryKeys.metRangeSummary(deviceIds.met, 'wind_speed', `${from}-${window.to}`),
            (prev) =>
              prev && prev.max != null && speed > prev.max
                ? { ...prev, max: Math.round(speed * 100) / 100 }
                : prev,
          );
        }
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
