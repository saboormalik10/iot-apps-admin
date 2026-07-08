'use client';

import Link from 'next/link';
import { Cpu, Waves } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/charts/status-badge';
import { Meter } from '@/components/charts/meter';
import { TableSkeleton, EmptyState } from '@/components/screen-states';
import { formatRelative } from '@/lib/time';
import { useDashboardDevices } from './use-dashboard';

/**
 * Device online table (plan §6) — one row per device with an online/offline status
 * badge (colour + icon + label) and a battery meter. Rows deep-link to detail;
 * `device:status` events refresh it live (see useDashboardRealtime).
 */
export function DeviceStatusTable() {
  const { data: devices, isLoading } = useDashboardDevices();

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-medium">Fleet status</h3>
      {isLoading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : !devices || devices.length === 0 ? (
        <EmptyState title="No devices yet" body="Devices auto-register when a mobile app first pairs." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Device</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Last seen</th>
                <th className="py-2 pl-2 font-medium">Battery</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d._id} className="border-b last:border-0">
                  <td className="py-2 pr-2">
                    <Link href={`/devices/${d._id}`} className="flex items-center gap-2 hover:underline">
                      {d.type === 'MET-LINK' ? <Cpu className="h-4 w-4" /> : <Waves className="h-4 w-4" />}
                      <span className="font-medium">{d.name}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    {d.isOnline ? (
                      <StatusBadge tone="ok" label="Online" />
                    ) : (
                      <StatusBadge tone="offline" label="Offline" />
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{d.lastSeenAt ? formatRelative(d.lastSeenAt) : '–'}</td>
                  <td className="w-32 py-2 pl-2">
                    <Meter value={d.lastBatteryPct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
