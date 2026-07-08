'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getSummary,
  getDashboardDevices,
  getMetLatest,
  getMetWindrose,
  getMetHistory,
  getNepLatest,
  getOrgDeviceMap,
} from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';

/** Dashboard query hooks (plan §14). Realtime handlers invalidate these keys. */

export function useSummary() {
  return useQuery({ queryKey: queryKeys.summary, queryFn: ({ signal }) => getSummary(signal) });
}

export function useDashboardDevices() {
  return useQuery({ queryKey: queryKeys.dashboardDevices, queryFn: ({ signal }) => getDashboardDevices(signal) });
}

export function useMetLatest(deviceId?: string) {
  return useQuery({
    queryKey: queryKeys.metLatest(deviceId ?? ''),
    queryFn: ({ signal }) => getMetLatest(deviceId!, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetWindrose(deviceId?: string) {
  return useQuery({
    queryKey: queryKeys.metWindrose(deviceId ?? ''),
    queryFn: ({ signal }) => getMetWindrose(deviceId!, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetHistory(params?: { deviceId: string; sensor: string; from: number; to: number }) {
  return useQuery({
    queryKey: params ? queryKeys.metHistory(params.deviceId, params.sensor, params.from, params.to) : ['met-history', 'idle'],
    queryFn: ({ signal }) => getMetHistory(params!, signal),
    enabled: Boolean(params?.deviceId),
  });
}

export function useNepLatest(deviceId?: string) {
  return useQuery({
    queryKey: queryKeys.nepLatest(deviceId ?? ''),
    queryFn: ({ signal }) => getNepLatest(deviceId!, signal),
    enabled: Boolean(deviceId),
  });
}

export function useOrgDeviceMap() {
  return useQuery({ queryKey: queryKeys.orgDeviceMap, queryFn: ({ signal }) => getOrgDeviceMap(signal) });
}
