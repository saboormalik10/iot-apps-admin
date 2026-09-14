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
 * may read it at all — the endpoint sits behind `SuperAdminGuard`.
 *
 * NOT used to populate the Stations table any more. That table follows the
 * navbar customer dropdown like every other screen, because a listing that
 * spanned customers produced rows whose detail page then refused to open. See
 * the note in `devices-list.tsx`.
 */
export function usePlatformDevices(
  params: { organizationId?: string; type?: string; page?: number; limit?: number },
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.platformDevices(params),
    queryFn: ({ signal }) => listPlatformDevices(params, signal),
    enabled,
  });
}

/**
 * How many stations exist across every customer.
 *
 * Asks for a single row and reads `total` off the pagination meta — the count is
 * the whole point, so fetching a page of rows to discard them would be waste.
 * Returns null until it is known, so a caller can render nothing rather than a
 * flickering zero.
 */
export function usePlatformStationCount(enabled: boolean): number | null {
  const { data } = usePlatformDevices({ page: 1, limit: 1 }, enabled);
  return data?.total ?? null;
}

/** Customers that own at least one station — the filter's options. */
export function useDeviceCustomers(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.deviceCustomers,
    queryFn: ({ signal }) => listDeviceCustomers(signal),
    enabled,
  });
}
