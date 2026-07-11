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

export function useScopedDevice(type: DeviceType): {
  deviceId?: string;
  device?: DashboardDevice;
  isAuto: boolean;
  candidates: DashboardDevice[];
} {
  const { scope } = useScope();
  const { data: devices = [] } = useDashboardDevices();

  return useMemo(() => {
    const ofType = devices.filter((d) => d.type === type);
    const explicit = scope.deviceId ? ofType.find((d) => d._id === scope.deviceId) : undefined;
    const mostRecent = [...ofType].sort(
      (a, b) => new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime(),
    )[0];
    const device = explicit ?? mostRecent;
    return { deviceId: device?._id, device, isAuto: !explicit && Boolean(device), candidates: ofType };
  }, [devices, scope.deviceId, type]);
}
