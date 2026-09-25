'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Cpu } from 'lucide-react';
import type { Device } from '@/lib/api/types';
import { useScope } from '@/lib/hooks/use-scope';
import { DataTable } from '@/components/data/data-table';
import { StatusBadge } from '@/components/charts/status-badge';
import { Meter } from '@/components/charts/meter';
import { formatRelative } from '@/lib/time';
import { useDevices } from './use-devices';

/**
 * Stations list (plan §Month 8) — filtered by the global Scope Bar. Rows link to
 * detail. A site install has one station, created by first-run setup; there is
 * no "Add station" here.
 */
export function DevicesList() {
  const router = useRouter();
  const { scope } = useScope();
  const [page, setPage] = useState(1);

  // Page number is meaningless across a different filter: staying on page 3 of a
  // result set that now has one page shows an empty table, which reads as "there
  // are no stations" rather than "you are past the end".
  useEffect(() => {
    setPage(1);
  }, [scope.deviceType]);

  const { data, isLoading, isError, refetch } = useDevices({ type: scope.deviceType, page, limit: 20 });

  const columns = useMemo<ColumnDef<Device, unknown>[]>(
    () => [
      {
        header: 'Station',
        cell: ({ row }) => {
          const d = row.original;
          return (
            <span className="flex items-center gap-2 font-medium">
              <Cpu className="h-4 w-4" />
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
      {
        header: 'Last seen',
        cell: ({ row }) => (row.original.lastSeenAt ? formatRelative(row.original.lastSeenAt) : '–'),
      },
      {
        header: 'Battery',
        cell: ({ row }) => <div className="w-28"><Meter value={row.original.lastBatteryPct} label="Battery" /></div>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Stations</h1>

      </div>

      <DataTable
        data={data?.rows ?? []}
        columns={columns}
        page={data?.page}
        pageCount={data?.pageCount}
        total={data?.total}
        onPageChange={setPage}
        isLoading={isLoading}
        error={isError}
        onRetry={() => refetch()}
        emptyLabel="No stations match this scope."
        getRowId={(d) => d._id}
        onRowClick={(d) => router.push(`/devices/${d._id}`)}
      />
    </div>
  );
}
