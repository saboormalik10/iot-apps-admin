'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  getDeviceHealth,
  listPlatformDevices,
  listDeviceCustomers,
  type DevicesQuery,
} from '@/lib/api/endpoints';
import type { DeviceType } from '@/lib/api/types';
import type {
  CreateDeviceInput,
  UpdateDeviceInput,
} from '@/lib/api/schemas';
import { queryKeys } from '@/lib/query/keys';

/**
 * Devices module hooks (plan §Month 8). Writes invalidate the relevant keys + audit.
 *
 * The firmware hooks were removed on 9 Sep 2026 with the panel they fed — see
 * devices-list.tsx. The backend endpoints still exist and are untouched.
 */

export function useDevices(q: DevicesQuery) {
  return useQuery({ queryKey: queryKeys.devices(q), queryFn: ({ signal }) => listDevices(q, signal) });
}
export function useDevice(id: string) {
  return useQuery({ queryKey: queryKeys.device(id), queryFn: ({ signal }) => getDevice(id, signal), enabled: Boolean(id) });
}
export function useDeviceHealth(id: string) {
  return useQuery({ queryKey: queryKeys.deviceHealth(id), queryFn: ({ signal }) => getDeviceHealth(id, signal), enabled: Boolean(id) });
}
function invalidateDeviceLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['devices'] });
  qc.invalidateQueries({ queryKey: queryKeys.dashboardDevices });
  qc.invalidateQueries({ queryKey: queryKeys.summary });
  qc.invalidateQueries({ queryKey: ['audit'] });
}

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeviceInput) => createDevice(input),
    onSuccess: () => invalidateDeviceLists(qc),
  });
}
export function useUpdateDevice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDeviceInput) => updateDevice(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.device(id) });
      invalidateDeviceLists(qc);
    },
  });
}
export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDevice(id),
    onSuccess: () => invalidateDeviceLists(qc),
  });
}
/**
 * The stations list, widened across customers for a platform administrator.
 *
 * `enabled` is the caller's decision rather than this hook's: only a super admin
 * who is NOT switched into a customer should see every tenant's stations. Once
 * switched they are acting AS that customer, and the ordinary tenant-scoped list
 * is the correct answer.
 */
export function usePlatformDevices(
  params: { organizationId?: string; type?: string; page?: number },
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.platformDevices(params),
    queryFn: ({ signal }) => listPlatformDevices(params, signal),
    enabled,
  });
}

/** Customers that own at least one station — the filter's options. */
export function useDeviceCustomers(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.deviceCustomers,
    queryFn: ({ signal }) => listDeviceCustomers(signal),
    enabled,
  });
}
