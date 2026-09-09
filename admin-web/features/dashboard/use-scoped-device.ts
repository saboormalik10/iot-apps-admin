'use client';

import { useMemo } from 'react';
import type { DashboardDevice, DeviceType } from '@/lib/api/types';
import { useScope } from '@/lib/hooks/use-scope';
import { useDashboardDevices } from './use-dashboard';

/**
 * Resolve the effective device for a DEVICE-SCOPED panel (plan §3.6). Most
 * dashboard/analytics endpoints hard-require a single deviceId, so when the Scope
 * Bar is on "All" we auto-select a sensible default (the most-recently-seen device
 * of the requested type) and flag it as auto-selected, rather than erroring.
 */
/**
 * The device type the scope is EFFECTIVELY narrowed to: the explicit type filter,
 * or — when a single device is selected — that device's type. Drives which
 * instrument panels and KPI tiles are shown.
 */
export function useEffectiveDeviceType(): DeviceType | undefined {
  const { scope } = useScope();
  const { data: devices = [] } = useDashboardDevices();
  if (scope.deviceType) return scope.deviceType;
  if (scope.deviceId) return devices.find((d) => d._id === scope.deviceId)?.type;
  return undefined;
}

/**
 * `isLoading` / `isError` are surfaced deliberately.
 *
 * The device list failing and the organisation genuinely owning no devices both
 * leave `devices` as `[]`, so a caller that only checks `deviceId` shows its
 * "no device — pair one from the mobile app" empty state for a plain 500. Every
 * caller can now tell the two apart, which matters most right after a customer
 * switch, where an empty page is a claim about that customer's fleet.
 */
export function useScopedDevice(type: DeviceType): {
  deviceId?: string;
  device?: DashboardDevice;
  isAuto: boolean;
  candidates: DashboardDevice[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const { scope } = useScope();
  const { data: devices = [], isLoading, isError, refetch } = useDashboardDevices();

  const resolved = useMemo(() => {
    const ofType = devices.filter((d) => d.type === type);
    const explicit = scope.deviceId ? ofType.find((d) => d._id === scope.deviceId) : undefined;
    const mostRecent = [...ofType].sort(
      (a, b) => new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime(),
    )[0];
    const device = explicit ?? mostRecent;
    return { deviceId: device?._id, device, isAuto: !explicit && Boolean(device), candidates: ofType };
  }, [devices, scope.deviceId, type]);

  return { ...resolved, isLoading, isError, refetch };
}
