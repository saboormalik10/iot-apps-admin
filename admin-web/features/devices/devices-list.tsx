'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Cpu, Waves } from 'lucide-react';
import type { Device } from '@/lib/api/types';
import { useScope } from '@/lib/hooks/use-scope';
import { DataTable } from '@/components/data/data-table';
import { StatusBadge } from '@/components/charts/status-badge';
import { Meter } from '@/components/charts/meter';
import { Button } from '@/components/ui/button';
import { Can } from '@/lib/rbac/guard';
import { formatRelative } from '@/lib/time';
import { useDevices } from './use-devices';
import { AddDeviceDialog } from './device-dialogs';
import { FirmwareStatusTable } from './firmware-status-table';

/**
 * Devices list (plan §Month 8) — the fleet table, filtered by the global Scope Bar
 * (device type). Rows link to detail. Admins can manually add a device. Firmware
 * status (outdated flags) sits alongside.
 */
export function DevicesList() {
  const router = useRouter();
  const { scope } = useScope();
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading } = useDevices({ type: scope.deviceType, page, limit: 20 });

  const columns = useMemo<ColumnDef<Device, unknown>[]>(
    () => [
      {
        header: 'Device',
        cell: ({ row }) => {
          const d = row.original;
          return (
            <span className="flex items-center gap-2 font-medium">
              {d.type === 'MET-LINK' ? <Cpu className="h-4 w-4" /> : <Waves className="h-4 w-4" />}
              {d.customName ?? d.name}
            </span>
          );
        },
      },
      { header: 'Type', cell: ({ row }) => row.original.type },
      {
        header: 'Status',
        cell: ({ row }) =>
          row.original.isOnline ? (
            <StatusBadge tone="ok" label="Online" />
          ) : (
            <StatusBadge tone="offline" label="Offline" />
          ),
      },
      { header: 'Firmware', cell: ({ row }) => row.original.firmwareVersion ?? '–' },
      {
        header: 'Last seen',
        cell: ({ row }) => (row.original.lastSeenAt ? formatRelative(row.original.lastSeenAt) : '–'),
      },
      {
        header: 'Battery',
        cell: ({ row }) => <div className="w-28"><Meter value={row.original.lastBatteryPct} /></div>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Devices</h1>
        <Can capability="manageDevices">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add device
          </Button>
        </Can>
      </div>

      <DataTable
        data={data?.rows ?? []}
        columns={columns}
        page={data?.page}
        pageCount={data?.pageCount}
        total={data?.total}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyLabel="No devices match this scope."
        getRowId={(d) => d._id}
        onRowClick={(d) => router.push(`/devices/${d._id}`)}
      />

      <FirmwareStatusTable type={scope.deviceType} />

      <AddDeviceDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
