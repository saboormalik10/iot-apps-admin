'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Cpu, Waves } from 'lucide-react'; // Plus ← "Add station" disabled
import type { Device } from '@/lib/api/types';
import { useScope } from '@/lib/hooks/use-scope';
import { DataTable } from '@/components/data/data-table';
import { StatusBadge } from '@/components/charts/status-badge';
import { Meter } from '@/components/charts/meter';
import { formatRelative } from '@/lib/time';
import { useDevices, usePlatformStationCount } from './use-devices';
import { useRbac } from '@/lib/rbac/context';

/**
 * Stations list (plan §Month 8) — the fleet table, filtered by the global Scope Bar
 * (station type). Rows link to detail.
 *
 * NO FIRMWARE HERE (removed 9 Sep 2026). The firmware-status panel and the
 * Firmware column could only ever render dashes: `firmwareVersion` is set by
 * hand through the device form and by nothing else. These stations deliver CSV
 * over SFTP, and a CSV file cannot report what firmware wrote it. Every one of
 * the ten live devices is a MET-LINK with no version and no target set. It was
 * built for NEP-LINK probes, which pair over BLE and could report their own
 * version; the deployment has none. Same call as the device settings page.
 *
 * ONE SOURCE, one table: `GET /devices`, always scoped to the organisation the
 * navbar dropdown currently selects — for a platform administrator too.
 *
 * It used to have a second mode. An unswitched super admin got a cross-customer
 * list with its OWN "Customer" filter, which meant two controls chose the
 * organisation and they disagreed: the navbar said one customer, the in-page
 * filter said "All customers", and the table obeyed the filter. Clicking any row
 * belonging to a different customer then opened `/devices/<id>`, which — like
 * every device route — is scoped to the ACTING organisation, so it answered
 * "Device not found" for a station the page had just listed.
 *
 * Fixing the detail route alone would not have been enough: that page's health,
 * readings and realtime subscription are each independently scoped, so it would
 * have loaded a header over empty panels. Making the list obey the one control
 * that actually changes tenancy removes the contradiction instead of papering
 * over it — a row you can see is now always a row you can open.
 *
 * The platform-wide total is still shown, so the fleet size is not lost; only
 * the listing narrowed.
 */
export function DevicesList() {
  const router = useRouter();
  const { scope } = useScope();
  const { isSuperAdmin } = useRbac();
  const [page, setPage] = useState(1);

  // Page number is meaningless across a different filter: staying on page 3 of a
  // result set that now has one page shows an empty table, which reads as "this
  // customer has no stations" rather than "you are past the end".
  useEffect(() => {
    setPage(1);
  }, [scope.deviceType]);

  const { data, isLoading, isError, refetch } = useDevices({ type: scope.deviceType, page, limit: 20 });

  // Platform-wide total, for a super admin only. A count, not a listing — it says
  // how big the fleet is without putting another customer's rows on this screen.
  const fleetTotal = usePlatformStationCount(isSuperAdmin);

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

        {/* The navbar customer dropdown is the ONLY control that chooses the
            organisation. A second one here is what made the table disagree with
            the rest of the portal. */}
        {isSuperAdmin && fleetTotal !== null ? (
          <p className="text-sm text-muted-foreground">
            Showing this customer&rsquo;s stations ·{' '}
            <span className="font-medium text-foreground">{fleetTotal}</span> across all customers
          </p>
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
        error={isError}
        onRetry={() => refetch()}
        emptyLabel="No stations match this scope."
        getRowId={(d) => d._id}
        onRowClick={(d) => router.push(`/devices/${d._id}`)}
      />
    </div>
  );
}
