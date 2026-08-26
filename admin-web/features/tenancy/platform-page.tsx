'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, Radio, Users, Activity, AlertTriangle, Plus } from 'lucide-react';

import { StatTile } from '@/components/charts/stat-tile';
import { StatusBadge } from '@/components/charts/status-badge';
import { DataTable } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingState } from '@/components/screen-states';
import { useQuery } from '@tanstack/react-query';
import { getPlatformOverview } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useRbac } from '@/lib/rbac/context';
import { useSwitchOrganization } from './use-org-switch';
import { CreateCustomerDialog } from './create-customer-dialog';
import { StationsDialog } from './stations-dialog';
import type { PlatformCustomerRow } from '@/lib/api/types';

const nf = new Intl.NumberFormat();

/** "3 minutes ago" without pulling in a date library for one string. */
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Cross-customer overview for platform administrators.
 *
 * Deliberately NOT a chart: the totals are magnitude-at-a-glance (stat tiles)
 * and the per-customer breakdown is identity across several unrelated measures,
 * which a table reads better than any plot would. Plotting stations against
 * readings on one axis would be the dual-axis mistake.
 */
export function PlatformPage() {
  const { isSuperAdmin } = useRbac();
  const switchOrg = useSwitchOrganization();
  const [createOpen, setCreateOpen] = useState(false);
  const [stationsFor, setStationsFor] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.platformOverview,
    queryFn: ({ signal }) => getPlatformOverview(signal),
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
  });

  const columns = useMemo<ColumnDef<PlatformCustomerRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Customer',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.timezone}</div>
          </div>
        ),
      },
      {
        id: 'stations',
        header: 'Stations',
        cell: ({ row }) => {
          const { stations, online } = row.original;
          if (stations === 0) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="tabular-nums">
              {online}/{stations} online
            </span>
          );
        },
      },
      {
        accessorKey: 'readings24h',
        header: 'Readings (24h)',
        cell: ({ row }) => <span className="tabular-nums">{nf.format(row.original.readings24h)}</span>,
      },
      {
        id: 'lastData',
        header: 'Last data',
        cell: ({ row }) => {
          const { stations, readings24h, lastDataAt } = row.original;
          // Status colours carry an icon and a label, never colour alone.
          if (stations > 0 && readings24h === 0) {
            return <StatusBadge tone="warn" label={ago(lastDataAt)} />;
          }
          return <span className="text-muted-foreground">{ago(lastDataAt)}</span>;
        },
      },
      { accessorKey: 'users', header: 'Users', cell: ({ row }) => <span className="tabular-nums">{row.original.users}</span> },
      {
        accessorKey: 'alertRules',
        header: 'Alert rules',
        cell: ({ row }) => <span className="tabular-nums">{row.original.alertRules}</span>,
      },
      {
        id: 'folders',
        header: 'Upload folders',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.uploadFolders.length ? row.original.uploadFolders.join(', ') : '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => setStationsFor({ id: row.original.organizationId, name: row.original.name })}
            >
              <Radio className="h-3.5 w-3.5" />
              Stations
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={switchOrg.isPending}
              onClick={() => switchOrg.mutate(row.original.organizationId)}
            >
              View
            </Button>
          </div>
        ),
      },
    ],
    [switchOrg],
  );

  if (!isSuperAdmin) {
    return <EmptyState title="Not available" body="This page is for platform administrators." />;
  }
  if (isLoading || !data) return <LoadingState label="Gathering figures across every customer…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">All customers</h1>
          <p className="text-sm text-muted-foreground">
            Every organisation on the platform. The only view that spans customers.
          </p>
        </div>
        <Button size="sm" className="gap-1 whitespace-nowrap" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New customer
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Customers" value={nf.format(data.customers)} icon={<Building2 className="h-4 w-4" />} />
        <StatTile
          label="Stations"
          value={nf.format(data.stations)}
          sub={`${nf.format(data.online)} online`}
          icon={<Radio className="h-4 w-4" />}
        />
        <StatTile label="Readings (24h)" value={nf.format(data.readings24h)} icon={<Activity className="h-4 w-4" />} />
        <StatTile label="Users" value={nf.format(data.users)} icon={<Users className="h-4 w-4" />} />
        <StatTile
          label="Silent customers"
          value={nf.format(data.silent)}
          sub={data.silent ? 'have stations, sent nothing in 24h' : 'all reporting'}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {data.rows.length === 0 ? (
        <EmptyState title="No customers yet" body="Create one to get started." />
      ) : (
        <DataTable columns={columns} data={data.rows} />
      )}

      <CreateCustomerDialog open={createOpen} onOpenChange={setCreateOpen} />
      {stationsFor ? (
        <StationsDialog
          organizationId={stationsFor.id}
          customerName={stationsFor.name}
          open
          onOpenChange={(o) => !o && setStationsFor(null)}
        />
      ) : null}
    </div>
  );
}
