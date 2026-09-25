'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listDevices,
  getDevice,
  updateDevice,
  getDeviceHealth,
  type DevicesQuery,
} from '@/lib/api/endpoints';
import type { UpdateDeviceInput } from '@/lib/api/schemas';
import { queryKeys } from '@/lib/query/keys';

/** Devices module hooks (plan §Month 8). Writes invalidate the relevant keys + audit. */

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
