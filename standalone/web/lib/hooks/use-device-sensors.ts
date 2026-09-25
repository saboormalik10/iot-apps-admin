'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { listDevices } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import type { Device } from '@/lib/api/types';

/**
 * Which sensors a device has actually reported.
 *
 * WHY THIS IS SERVER-DERIVED, NOT INFERRED
 * The obvious client-side approach — hide a panel when its value is currently
 * null — cannot tell "this station has no thermometer" from "the thermometer read
 * null on this poll". It also flickers as values arrive. `Device.availableSensors`
 * is maintained by the ingester from the columns files actually carry, and
 * self-heals over a 7-day window in the daily rollup, so it is authoritative.
 *
 * WHY A SEVEN-DAY WINDOW MATTERS HERE
 * A wind station in still air reports speed but no bearing for a whole day. Judged
 * on one day, `wind_dir` would drop out and the wind rose would vanish, then
 * reappear on the next breezy day. The backend already smooths that; this hook
 * simply consumes the result.
 *
 * FAIL-OPEN
 * An unknown device, an empty list, or a device that has not ingested yet returns
 * `null` — meaning "no opinion", and callers show everything. Hiding panels
 * because a fetch had not landed would be worse than showing an empty one.
 */
export interface DeviceSensors {
  /** Sensor keys the device reports, or null when we have no opinion yet. */
  keys: string[] | null;
  /** True when the device has reported at least one sensor. */
  known: boolean;
  /**
   * True once the devices list has actually been fetched — regardless of whether
   * it yielded an opinion.
   *
   * `known` cannot answer "should I wait?": it is false both while the request is
   * in flight AND for a device that has genuinely never ingested. A caller that
   * waited on `known` would wait forever for the second case. Callers that size
   * their layout from `has()` must wait on THIS, or they render every tile
   * fail-open and then drop tiles when the list lands — which is a layout shift
   * measured at CLS ~0.39 on the dashboard (M24 W2).
   */
  resolved: boolean;
  /** Mast heading offset; 0 means bearings are relative, not true north. */
  headingOffsetDeg: number;
  /** Convenience: does this device report `key`? Fails open when unknown. */
  has: (key: string) => boolean;
}

export function useDeviceSensors(deviceId?: string): DeviceSensors {
  // Reuses the devices list rather than adding a per-device request — the list is
  // already fetched for the scope selector and is cached.
  const { data, isPending } = useQuery({
    queryKey: queryKeys.devices({ page: 1, limit: 100 }),
    queryFn: ({ signal }) => listDevices({ page: 1, limit: 100 }, signal),
    staleTime: 60_000,
  });

  return useMemo<DeviceSensors>(() => {
    const list: Device[] = data?.rows ?? [];
    const device = deviceId ? list.find((d) => d._id === deviceId) : undefined;
    const keys = device?.availableSensors?.length ? device.availableSensors : null;

    return {
      keys,
      known: keys !== null,
      resolved: !isPending,
      headingOffsetDeg: device?.headingOffsetDeg ?? 0,
      // Fail open: with no list to consult, every sensor is "available".
      has: (key: string) => (keys === null ? true : keys.includes(key)),
    };
  }, [data, isPending, deviceId]);
}
