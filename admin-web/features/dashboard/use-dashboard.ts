'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getSummary,
  getDashboardDevices,
  getMetLatest,
  getMetWindrose,
  getMetHistory,
  getMetHistoryMulti,
  getNepLatest,
  getOrgDeviceMap,
} from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useScope } from '@/lib/hooks/use-scope';

/**
 * Dashboard query hooks (plan §14). Realtime handlers invalidate these keys.
 *
 * The Scope Bar's "Include demo data" toggle is threaded through here: it's passed
 * to the backend (which filters demo records/sessions) AND appended to the query key
 * — at the END, so the realtime prefix-invalidations (e.g. queryKeys.summary) still
 * match. Default is OFF → demo data is excluded.
 */

export function useSummary() {
  const { scope } = useScope();
  return useQuery({
    // Scope (type/device/demo) appended AFTER the prefix so realtime
    // prefix-invalidations on queryKeys.summary still match.
    queryKey: [...queryKeys.summary, scope.deviceType ?? null, scope.deviceId ?? null] as const,
    queryFn: ({ signal }) =>
      getSummary({ type: scope.deviceType, deviceId: scope.deviceId }, signal),
  });
}

export function useDashboardDevices() {
  // This feeds the scope-bar device picker AND the fleet table, so scoping it is
  // what stops a demo device being selectable in real mode (and the reverse).
  const { scope } = useScope();
  return useQuery({
    queryKey: [...queryKeys.dashboardDevices] as const,
    queryFn: ({ signal }) => getDashboardDevices(signal),
  });
}

export function useMetLatest(deviceId?: string) {
  const { scope } = useScope();
  return useQuery({
    queryKey: [...queryKeys.metLatest(deviceId ?? '')] as const,
    queryFn: ({ signal }) => getMetLatest(deviceId!, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetWindrose(deviceId?: string) {
  const { scope } = useScope();
  return useQuery({
    queryKey: [...queryKeys.metWindrose(deviceId ?? '')] as const,
    queryFn: ({ signal }) => getMetWindrose(deviceId!, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetHistory(params?: { deviceId: string; sensor: string; from: number; to: number; }) {
  return useQuery({
    queryKey: params
      ? ([...queryKeys.metHistory(params.deviceId, params.sensor, params.from, params.to)] as const)
      : (['met-history', 'idle'] as const),
    queryFn: ({ signal }) => getMetHistory(params!, signal),
    enabled: Boolean(params?.deviceId),
  });
}

/**
 * One request for the whole sensor graph stack (min/avg/max per adaptive bucket
 * for every sensor at once) — replaces the 8-way fan-out of `useMetHistory`, so
 * the dashboard makes a single call with a single, display-sized payload.
 */
export function useMetHistoryMulti(params?: {
  deviceId: string;
  sensors: string[];
  from: number;
  to: number;
}) {
  return useQuery({
    queryKey: params
      ? ([
          ...queryKeys.metHistoryMulti(params.deviceId, params.sensors.join(','), params.from, params.to),
        ] as const)
      : (['met-history-multi', 'idle'] as const),
    queryFn: ({ signal }) => getMetHistoryMulti(params!, signal),
    enabled: Boolean(params?.deviceId),
  });
}

export function useNepLatest(deviceId?: string) {
  const { scope } = useScope();
  return useQuery({
    queryKey: [...queryKeys.nepLatest(deviceId ?? '')] as const,
    queryFn: ({ signal }) => getNepLatest(deviceId!, signal),
    enabled: Boolean(deviceId),
  });
}

export function useOrgDeviceMap() {
  return useQuery({ queryKey: queryKeys.orgDeviceMap, queryFn: ({ signal }) => getOrgDeviceMap(signal) });
}
