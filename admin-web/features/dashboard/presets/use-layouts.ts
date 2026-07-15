'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listDashboardLayouts,
  createDashboardLayout,
  updateDashboardLayout,
  deleteDashboardLayout,
  setDefaultDashboardLayout,
  type CreateLayoutInput,
} from '@/lib/api/endpoints';
import type { DashboardLayout } from '@/lib/api/types';
import { queryKeys } from '@/lib/query/keys';

/** Dashboard-preset hooks (plan §Month 11). Layouts are per-user + per-device. */

export function useDashboardLayouts(deviceId?: string) {
  return useQuery({
    queryKey: queryKeys.dashboardLayouts(deviceId),
    queryFn: ({ signal }) => listDashboardLayouts(deviceId, signal),
    enabled: Boolean(deviceId),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['dashboard-layouts'] });
}

export function useCreateLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLayoutInput) => createDashboardLayout(input),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; tiles?: DashboardLayout['tiles'] }) =>
      updateDashboardLayout(id, body),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDashboardLayout(id),
    onSuccess: () => invalidate(qc),
  });
}

export function useSetDefaultLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setDefaultDashboardLayout(id),
    onSuccess: () => invalidate(qc),
  });
}
