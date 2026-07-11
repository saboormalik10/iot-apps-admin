'use client';

import { useQuery } from '@tanstack/react-query';
import { useScope } from '@/lib/hooks/use-scope';
import { queryKeys } from '@/lib/query/keys';
import {
  getMetWindRoseAgg,
  getMetMultiSensor,
  getMetStatistics,
  getMetWindGust,
  getMetComfort,
  getMetFogRisk,
  getMetPressureTendency,
  getMetDailySummary,
  type AnalyticsWindow,
} from '@/lib/api/endpoints';

/**
 * MET analytics query hooks (plan §Month 9). Every hook fetches once on load and
 * keys on the device + the MEMOIZED Scope Bar window (minute-quantized in
 * use-scope) + its own params — so the key is render-stable and never loops.
 * useAnalyticsRealtime invalidates these on socket events ("refetch is truth").
 */
function useWindow(deviceId?: string): { win: AnalyticsWindow | undefined; from: number; to: number } {
  const { window, scope } = useScope();
  const from = window.from ?? 0;
  const to = window.to;
  const win = deviceId ? { deviceId, from: window.from, to: window.to, includeDemo: scope.includeDemo } : undefined;
  return { win, from, to };
}

export function useMetWindRose(deviceId?: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.windRose(deviceId ?? '', from, to),
    queryFn: ({ signal }) => getMetWindRoseAgg(win!, {}, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetMultiSensor(deviceId: string | undefined, sensors: string[], interval: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.multiSensor(deviceId ?? '', sensors.join(','), interval, from, to),
    queryFn: ({ signal }) => getMetMultiSensor(win!, sensors, interval, signal),
    enabled: Boolean(deviceId) && sensors.length > 0,
  });
}

export function useMetStatistics(deviceId: string | undefined, sensor: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.statistics(deviceId ?? '', sensor, from, to),
    queryFn: ({ signal }) => getMetStatistics(win!, sensor, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetWindGust(deviceId: string | undefined, interval: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.windGust(deviceId ?? '', interval, from, to),
    queryFn: ({ signal }) => getMetWindGust(win!, interval, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetComfort(deviceId: string | undefined, interval: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.comfort(deviceId ?? '', interval, from, to),
    queryFn: ({ signal }) => getMetComfort(win!, interval, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetFogRisk(deviceId: string | undefined, interval: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.fogRisk(deviceId ?? '', interval, from, to),
    queryFn: ({ signal }) => getMetFogRisk(win!, interval, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetPressureTendency(deviceId: string | undefined, hours: number) {
  return useQuery({
    queryKey: queryKeys.analytics.pressureTendency(deviceId ?? '', hours),
    queryFn: ({ signal }) => getMetPressureTendency(deviceId!, hours, signal),
    enabled: Boolean(deviceId),
  });
}

export function useMetDailySummary(deviceId?: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.metDaily(deviceId ?? '', from, to),
    queryFn: ({ signal }) => getMetDailySummary(win!, signal),
    enabled: Boolean(deviceId),
  });
}
