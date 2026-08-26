'use client';

import { useQuery } from '@tanstack/react-query';
import { useScope } from '@/lib/hooks/use-scope';
import { queryKeys } from '@/lib/query/keys';
import { getFleetHealth, getOrgDeviceComparison } from '@/lib/api/endpoints';

/** Org fleet-health table (plan §Month 10) — org-wide, no device scope. */
export function useFleetHealth() {
  return useQuery({
    queryKey: queryKeys.analytics.fleetHealth,
    queryFn: ({ signal }) => getFleetHealth(signal),
  });
}

/** Multi-device single-sensor overlay (plan §Month 10). Keys on the memoized window. */
export function useDeviceComparison(deviceIds: string[], sensor: string, interval: string) {
  const { window, scope } = useScope();
  const from = window.from ?? 0;
  const to = window.to;
  return useQuery({
    queryKey: queryKeys.analytics.deviceComparison(deviceIds.join(','), sensor, interval, from, to),
    queryFn: ({ signal }) =>
      getOrgDeviceComparison(
        { deviceIds, sensor, interval, from: window.from, to: window.to },
        signal,
      ),
    enabled: deviceIds.length > 0 && Boolean(sensor),
  });
}
