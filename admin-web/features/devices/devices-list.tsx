'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Cpu, Waves } from 'lucide-react'; // Plus ← "Add station" disabled
import type { Device, PlatformDevice } from '@/lib/api/types';
import { useScope } from '@/lib/hooks/use-scope';
import { DataTable } from '@/components/data/data-table';
import { StatusBadge } from '@/components/charts/status-badge';
import { Meter } from '@/components/charts/meter';
import { formatRelative } from '@/lib/time';
import { useDevices, usePlatformDevices, useDeviceCustomers } from './use-devices';
import { useRbac } from '@/lib/rbac/context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FirmwareStatusTable } from './firmware-status-table';

/**
 * Stations list (plan §Month 8) — the fleet table, filtered by the global Scope Bar
 * (station type). Rows link to detail. Firmware status sits alongside.
 *
 * TWO SOURCES, one table.
 *
 * `GET /devices` is hard-scoped to a single organisation and stays that way: a
 * tenant-scoped list widened on a role check is how cross-tenant leaks happen.
 * A platform administrator therefore reads a SEPARATE endpoint behind
 * `SuperAdminGuard`, which carries the owning customer on every row and can be
 * filtered by customer.
 *
 * A super admin who has SWITCHED into a customer uses the ordinary scoped list —
 * they are acting as that customer, and showing them every tenant's stations
 * under a customer's banner would contradict the "acting as" model entirely.
 */
export function DevicesList() {
  const router = useRouter();
  const { scope } = useScope();
  const { isSuperAdmin, user } = useRbac();
  const [page, setPage] = useState(1);
  const [customerId, setCustomerId] = useState<string>('all');

  const platformView = isSuperAdmin && !user?.homeOrganizationId;

  const scoped = useDevices({ type: scope.deviceType, page, limit: 20 });
  const platform = usePlatformDevices(
    { type: scope.deviceType, page, organizationId: customerId === 'all' ? undefined : customerId },
    platformView,
  );
  const { data: customers } = useDeviceCustomers(platformView);

  const { data, isLoading } = platformView ? platform : scoped;

  const columns = useMemo<ColumnDef<Device, unknown>[]>(
    () => [
      {
        header: 'Station',
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
      ...(platformView
        ? [
            {
              header: 'Customer',
              cell: ({ row }: { row: { original: Device } }) => (
                <span className="text-muted-foreground">
                  {(row.original as PlatformDevice).organizationName}
                </span>
              ),
            },
          ]
        : []),
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
        cell: ({ row }) => <div className="w-28"><Meter value={row.original.lastBatteryPct} label="Battery" /></div>,
      },
    ],
    [platformView],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Stations</h1>

        {platformView ? (
          <div className="flex items-center gap-2">
            <label htmlFor="customer-filter" className="text-sm text-muted-foreground">
              Customer
            </label>
            <Select
              value={customerId}
              onValueChange={(v) => {
                setCustomerId(v);
                // Page 1: staying on page 3 of a filter that now has one page shows
                // an empty table and reads as "this customer has no stations".
                setPage(1);
              }}
            >
              <SelectTrigger id="customer-filter" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {/* "Add station" removed — the Button/Can/AddDeviceDialog imports went with
            it. Stations are created through platform
            provisioning (POST /platform/stations), which also creates the SFTP
            account and the upload folder. A device added here would have no
            account and no folder, so nothing could ever upload to it — a row that
            looks like a station and can never receive data.
        <Can capability="manageDevices">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add device
          </Button>
        </Can> */}
      </div>

      <DataTable
        data={data?.rows ?? []}
        columns={columns}
        page={data?.page}
        pageCount={data?.pageCount}
        total={data?.total}
        onPageChange={setPage}
        isLoading={isLoading}
        emptyLabel="No stations match this scope."
        getRowId={(d) => d._id}
        onRowClick={(d) => router.push(`/devices/${d._id}`)}
      />

      <FirmwareStatusTable type={scope.deviceType} />

    </div>
  );
}
