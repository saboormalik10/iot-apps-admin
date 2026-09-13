'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, Radio, Users, Activity, AlertTriangle, Plus, Trash2, Home } from 'lucide-react';

import { StatTile } from '@/components/charts/stat-tile';
import { StatusBadge } from '@/components/charts/status-badge';
import { DataTable } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-states';
import { useQuery } from '@tanstack/react-query';
import { getPlatformOverview } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useRbac } from '@/lib/rbac/context';
import { useSwitchOrganization } from './use-org-switch';
import { CreateCustomerDialog } from './create-customer-dialog';
import { StationsDialog } from './stations-dialog';
import { ConfirmDialog } from '@/components/data/confirm-dialog';
import { deleteCustomer, setHomeCustomer } from '@/lib/api/endpoints';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  const { isSuperAdmin, user } = useRbac();
  const switchOrg = useSwitchOrganization();
  const [createOpen, setCreateOpen] = useState(false);
  const [stationsFor, setStationsFor] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlatformCustomerRow | null>(null);
  const toast = useApiToast();
  const qc = useQueryClient();

  /**
   * The server refuses while the customer still has an active station, and its
   * message names the count. That message is surfaced verbatim rather than
   * replaced with something generic — "delete the stations first" is only
   * actionable if it says how many there are.
   */
  /**
   * The administrator's home organisation — where they land on sign-in.
   *
   * While switched, the token carries the real home separately; otherwise the
   * org they are acting in IS home. Reading only `organizationId` would mark
   * whichever customer they were viewing as home, which is precisely wrong.
   */
  const homeId = user?.homeOrganizationId ?? user?.organizationId ?? null;

  const makeHome = useMutation({
    mutationFn: (row: PlatformCustomerRow) => setHomeCustomer(row.organizationId),
    onSuccess: (res) => {
      toast.success(`${res.name} is now your home organisation`);
      // Re-issue the session at the NEW home. `null` means "return to my
      // organisation", which the row above has just changed — and the switch
      // does a full reload, so nothing is left holding the old identity.
      switchOrg.mutate(null);
    },
    onError: (e) => toast.error(e),
  });

  const remove = useMutation({
    mutationFn: (row: PlatformCustomerRow) => deleteCustomer(row.organizationId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.platformOverview });
      qc.invalidateQueries({ queryKey: queryKeys.organizations });
      toast.success(
        res.deactivatedUsers > 0
          ? `${res.name} deleted — ${res.deactivatedUsers} ${res.deactivatedUsers === 1 ? 'person' : 'people'} signed out`
          : `${res.name} deleted`,
      );
      setPendingDelete(null);
    },
    onError: (e) => toast.error(e),
  });

  const { data, isLoading, isError, refetch } = useQuery({
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
            {/* Already home: shown, not offered — a button that does nothing
                is worse than a label saying it is already the case. */}
            {row.original.organizationId === homeId ? (
              <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground">
                <Home className="h-3.5 w-3.5" />
                Home
              </span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                disabled={makeHome.isPending || switchOrg.isPending}
                onClick={() => makeHome.mutate(row.original)}
                aria-label={`Make ${row.original.name} the home organisation`}
              >
                <Home className="h-3.5 w-3.5" />
                Make home
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-status-error"
              onClick={() => setPendingDelete(row.original)}
              aria-label={`Delete ${row.original.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [switchOrg, makeHome, homeId],
  );

  if (!isSuperAdmin) {
    return <EmptyState title="Not available" body="This page is for platform administrators." />;
  }
  // Error before the `!data` gate. Falling through to LoadingState on a failure
  // spins forever: `isLoading` is false once the request settles, so the old
  // `isLoading || !data` condition stayed true with no request left to finish.
  if (isError) {
    return <ErrorState title="Couldn't load the platform overview" onRetry={() => refetch()} />;
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

      {/* Conditional, and this one matters more than most: the dialog holds the
          generated password in state, so left mounted it would reopen showing the
          PREVIOUS customer's credentials. */}
      {createOpen ? <CreateCustomerDialog open onOpenChange={setCreateOpen} /> : null}

      {/**
       * Two different dialogs, because they are two different conversations.
       *
       * With stations still live there is nothing to confirm — the server will
       * refuse — so asking "are you sure?" would invite a click that fails. The
       * dialog says what to do instead and offers no destructive button at all.
       * The station count comes from the same overview row the operator is
       * looking at, so the instruction is specific rather than generic advice.
       */}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete customer?'}
        description={
          pendingDelete && pendingDelete.stations > 0 ? (
            <>
              <span className="block font-medium text-foreground">
                This customer still has {pendingDelete.stations}{' '}
                {pendingDelete.stations === 1 ? 'station' : 'stations'}.
              </span>
              <span className="mt-2 block">
                Delete {pendingDelete.stations === 1 ? 'it' : 'them'} first — deleting a station is what disables
                its SFTP login. Removing the customer while a login is live would leave its logger uploading into
                an account that belongs to nobody.
              </span>
              <span className="mt-2 block">
                Open <strong>Stations</strong> on this row to remove {pendingDelete.stations === 1 ? 'it' : 'them'}.
              </span>
            </>
          ) : (
            <>
              <span className="block font-medium text-foreground">This cannot be undone.</span>
              <span className="mt-2 block">
                {pendingDelete?.users ? (
                  <>
                    Their {pendingDelete.users} {pendingDelete.users === 1 ? 'person' : 'people'} will be{' '}
                    <strong>signed out and deactivated</strong>, and the customer disappears from this list.
                  </>
                ) : (
                  <>The customer disappears from this list.</>
                )}
              </span>
              <span className="mt-2 block">
                Their readings and history are <strong>kept</strong>, and nothing on the SFTP server is touched.
              </span>
            </>
          )
        }
        confirmLabel="Delete customer"
        hideConfirm={Boolean(pendingDelete && pendingDelete.stations > 0)}
        destructive
        onConfirm={() => {
          if (pendingDelete && pendingDelete.stations === 0) remove.mutate(pendingDelete);
        }}
      />
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
