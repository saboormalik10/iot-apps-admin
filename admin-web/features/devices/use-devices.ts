'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  getDeviceStats,
  getDeviceHealth,
  getFirmwareHistory,
  getDeviceSettings,
  updateDeviceSettings,
  getFirmwareTargets,
  setFirmwareTarget,
  getFirmwareStatus,
  type DevicesQuery,
} from '@/lib/api/endpoints';
import type { DeviceType, FirmwareTarget } from '@/lib/api/types';
import type {
  CreateDeviceInput,
  DeviceSettingsInput,
  UpdateDeviceInput,
} from '@/lib/api/schemas';
import { queryKeys } from '@/lib/query/keys';

/** Devices module hooks (plan §Month 8). Writes invalidate the relevant keys + audit. */

export function useDevices(q: DevicesQuery) {
  return useQuery({ queryKey: queryKeys.devices(q), queryFn: ({ signal }) => listDevices(q, signal) });
}
export function useDevice(id: string) {
  return useQuery({ queryKey: queryKeys.device(id), queryFn: ({ signal }) => getDevice(id, signal), enabled: Boolean(id) });
}
export function useDeviceStats(id: string) {
  return useQuery({ queryKey: queryKeys.deviceStats(id), queryFn: ({ signal }) => getDeviceStats(id, signal), enabled: Boolean(id) });
}
export function useDeviceHealth(id: string) {
  return useQuery({ queryKey: queryKeys.deviceHealth(id), queryFn: ({ signal }) => getDeviceHealth(id, signal), enabled: Boolean(id) });
}
export function useFirmwareHistory(id: string) {
  return useQuery({ queryKey: queryKeys.firmwareHistory(id), queryFn: ({ signal }) => getFirmwareHistory(id, signal), enabled: Boolean(id) });
}
export function useFirmwareTargets() {
  return useQuery({ queryKey: queryKeys.firmwareTargets, queryFn: ({ signal }) => getFirmwareTargets(signal) });
}
export function useFirmwareStatus(type?: DeviceType) {
  return useQuery({ queryKey: queryKeys.firmwareStatus(type), queryFn: ({ signal }) => getFirmwareStatus(type, signal) });
}
export function useDeviceSettings(id: string) {
  return useQuery({ queryKey: queryKeys.deviceSettings(id), queryFn: ({ signal }) => getDeviceSettings(id, signal), enabled: Boolean(id) });
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
export function useUpdateDeviceSettings(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceSettingsInput) => updateDeviceSettings(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deviceSettings(id) });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
export function useSetFirmwareTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FirmwareTarget) => setFirmwareTarget(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.firmwareTargets });
      qc.invalidateQueries({ queryKey: ['devices', 'firmware-status'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
