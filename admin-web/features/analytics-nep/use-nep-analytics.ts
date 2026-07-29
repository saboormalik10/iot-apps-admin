'use client';

import { useQuery } from '@tanstack/react-query';
import { useScope } from '@/lib/hooks/use-scope';
import { queryKeys } from '@/lib/query/keys';
import {
  getNepTurbidityDistribution,
  getNepProbeBreakdown,
  getNepCorrelation,
  getNepGpsDensity,
  getNepSessionComparison,
  getNepWaterQuality,
  getNepSessionEvents,
  getNepDailySummary,
  getNepCrossSessionTrend,
  type AnalyticsWindow,
} from '@/lib/api/endpoints';

/**
 * NEP analytics query hooks (plan §Month 10). Every hook keys on the device +
 * the MEMOIZED Scope Bar window (minute-quantized in use-scope) + its own params,
 * so keys are render-stable and never loop. useNepAnalyticsRealtime invalidates
 * these on socket events ("refetch is truth"). No polling.
 */
function useWindow(deviceId?: string): { win: AnalyticsWindow | undefined; from: number; to: number } {
  const { window, scope } = useScope();
  const from = window.from ?? 0;
  const to = window.to;
  const win = deviceId ? { deviceId, from: window.from, to: window.to, demoOnly: scope.demoOnly } : undefined;
  return { win, from, to };
}

export function useNepTurbidityDistribution(deviceId?: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.nepTurbidity(deviceId ?? '', from, to),
    queryFn: ({ signal }) => getNepTurbidityDistribution(win!, signal),
    enabled: Boolean(deviceId),
  });
}

export function useNepProbeBreakdown(deviceId?: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.nepProbe(deviceId ?? '', from, to),
    queryFn: ({ signal }) => getNepProbeBreakdown(win!, signal),
    enabled: Boolean(deviceId),
  });
}

export function useNepCorrelation(deviceId?: string, sessionId?: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.nepCorrelation(deviceId ?? '', sessionId ?? '', from, to),
    queryFn: ({ signal }) => getNepCorrelation(win!, sessionId, signal),
    enabled: Boolean(deviceId),
  });
}

export function useNepGpsDensity(deviceId?: string, resolution: 'low' | 'medium' | 'high' = 'medium') {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.nepGpsDensity(deviceId ?? '', resolution, from, to),
    queryFn: ({ signal }) => getNepGpsDensity(win!, resolution, signal),
    enabled: Boolean(deviceId),
  });
}

export function useNepSessionComparison(sessionIds: string[]) {
  return useQuery({
    queryKey: queryKeys.analytics.nepComparison(sessionIds.join(',')),
    queryFn: ({ signal }) => getNepSessionComparison(sessionIds, signal),
    enabled: sessionIds.length > 0,
  });
}

export function useNepWaterQuality(sessionId?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.nepWaterQuality(sessionId ?? ''),
    queryFn: ({ signal }) => getNepWaterQuality(sessionId!, signal),
    enabled: Boolean(sessionId),
  });
}

export function useNepSessionEvents(sessionId?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.nepSessionEvents(sessionId ?? ''),
    queryFn: ({ signal }) => getNepSessionEvents(sessionId!, {}, signal),
    enabled: Boolean(sessionId),
  });
}

export function useNepDailySummary(deviceId?: string) {
  const { win, from, to } = useWindow(deviceId);
  return useQuery({
    queryKey: queryKeys.analytics.nepDaily(deviceId ?? '', from, to),
    queryFn: ({ signal }) => getNepDailySummary(win!, signal),
    enabled: Boolean(deviceId),
  });
}

export function useNepCrossSessionTrend(deviceId?: string) {
  const { window } = useScope();
  const from = window.from ?? 0;
  const to = window.to;
  return useQuery({
    queryKey: queryKeys.analytics.nepCrossTrend(deviceId ?? '', from, to),
    queryFn: ({ signal }) => getNepCrossSessionTrend({ deviceId: deviceId!, from: window.from, to: window.to }, signal),
    enabled: Boolean(deviceId),
  });
}
