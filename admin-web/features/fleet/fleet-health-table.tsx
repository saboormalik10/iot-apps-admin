'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Cpu, Waves } from 'lucide-react';
import type { FleetHealthRow } from '@/lib/api/types';
import { DataTable } from '@/components/data/data-table';
import { StatusBadge } from '@/components/charts/status-badge';
import { Meter } from '@/components/charts/meter';
import { fmt } from '@/components/charts/chart-utils';
import { useFleetHealth } from './use-fleet';

const relTime = (iso: string | null) => {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

/**
 * Fleet-health dashboard (plan §6, §Month 10) — one row per device with online
 * status, a battery meter, usage counts, and an estimated storage footprint.
 * Org-wide (not device-scoped) — the whole fleet at a glance.
 */
export function FleetHealthTable() {
  const { data, isLoading } = useFleetHealth();

  const columns = useMemo<ColumnDef<FleetHealthRow, unknown>[]>(
    () => [
      {
        header: 'Device',
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            {row.original.type === 'NEP-LINK' ? (
              <Waves className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Cpu className="h-4 w-4 text-muted-foreground" />
            )}
            {row.original.deviceName}
          </span>
        ),
      },
      { header: 'Type', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.type}</span> },
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
        header: 'Battery',
        cell: ({ row }) => <Meter value={row.original.batteryPct} label="Battery" className="min-w-[7rem]" />,
      },
      {
        header: 'Data',
        cell: ({ row }) =>
          row.original.type === 'NEP-LINK'
            ? `${row.original.totalSessions.toLocaleString()} sessions`
            : `${row.original.totalRecords.toLocaleString()} records`,
      },
      { header: 'Storage', cell: ({ row }) => `${fmt(row.original.storageEstimateMb, 1)} MB` },
      { header: 'Age', cell: ({ row }) => (row.original.daysSinceFirst != null ? `${fmt(row.original.daysSinceFirst, 0)}d` : '—') },
      { header: 'Last seen', cell: ({ row }) => <span className="text-xs text-muted-foreground">{relTime(row.original.lastSeenAt)}</span> },
    ],
    [],
  );

  return (
    <DataTable
      data={data ?? []}
      columns={columns}
      isLoading={isLoading}
      getRowId={(r) => r.deviceId}
      emptyLabel="No devices in this organization yet."
    />
  );
}
