'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio, Search } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/charts/status-badge';
import { EmptyState } from '@/components/screen-states';
import { setStationStreamEnabled } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { cn } from '@/lib/utils';
import type { StreamTypeRow } from '@/lib/api/types';

type Station = NonNullable<StreamTypeRow['stations']>[number];

/**
 * Which stations use one format, and whether each may ingest it.
 *
 * A dialog rather than a list on the page: at eleven stations the page was
 * already a wall of chips, and this grows with every customer. Search is here
 * for the same reason — finding one station among a platform's worth is the
 * actual task.
 *
 * The toggle is per STATION, replacing a type-level switch that was never
 * enforced anywhere: ingest resolves its parser from the code registry and never
 * read it, so the old switch looked like a kill switch and stopped nothing.
 * Turning a station off here refuses its files at ingest and quarantines them,
 * so nothing is lost and re-enabling can replay them.
 */
export function StationsDialog({
  type,
  canEdit,
  open,
  onOpenChange,
}: {
  type: StreamTypeRow | null;
  /** Super admins toggle; customers read. Switching a stream off stops data. */
  canEdit: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const qc = useQueryClient();
  const toast = useApiToast();

  /**
   * Optimistic, because the switch is a DIRECT MANIPULATION control.
   *
   * Waiting for the round trip left the switch sitting in its old position with
   * no indication anything had happened, which reads as "the click didn't take"
   * — the natural response being to click again, i.e. to toggle it back.
   *
   * The cache is patched rather than a local copy of the list: the page derives
   * the dialog's row from this same query, so patching here is what moves the
   * switch, the row's dimming, and the "Ingesting/Stopped" label together.
   */
  const toggle = useMutation({
    mutationFn: (v: { stationAccountId: string; enabled: boolean }) =>
      setStationStreamEnabled(type!.key, v.stationAccountId, v.enabled),

    onMutate: async (v) => {
      // Stop an in-flight refetch from landing on top of the patch below.
      await qc.cancelQueries({ queryKey: queryKeys.streamTypes });
      // `getQueriesData`, not `getQueryData`: the key carries the caller's
      // super-admin flag, so there can be more than one cached list.
      const previous = qc.getQueriesData<StreamTypeRow[]>({ queryKey: queryKeys.streamTypes });

      qc.setQueriesData<StreamTypeRow[]>({ queryKey: queryKeys.streamTypes }, (rows) =>
        rows?.map((t) =>
          t.key !== type?.key
            ? t
            : {
                ...t,
                // Matched on the account alone, exactly as the server does. One
                // account can appear as several folder rows, and they must not
                // disagree with each other while the request is in flight.
                stations: t.stations?.map((st) =>
                  st.stationAccountId === v.stationAccountId ? { ...st, enabled: v.enabled } : st,
                ),
              },
        ),
      );

      return { previous };
    },

    onError: (_err, _v, ctx) => {
      // Put every list back exactly as it was; a half-applied optimistic patch
      // would claim a station is ingesting when the server refused the change.
      ctx?.previous?.forEach(([key, rows]) => qc.setQueryData(key, rows));
      toast.error("Couldn't change this station");
    },

    onSuccess: (r) => {
      toast.success(r.enabled ? 'Station will ingest this format' : 'Station will no longer ingest this format');
    },

    // Reconcile with the server on both paths, so the optimistic value is never
    // what the screen settles on.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.streamTypes });
    },
  });

  /** Only the row being changed is frozen — not all eleven. */
  const pendingStationId = toggle.isPending ? toggle.variables?.stationAccountId : undefined;

  // Memoised so the fallback `[]` is not a fresh array on every render, which
  // would make the filter below recompute each time.
  const stations: Station[] = useMemo(() => type?.stations ?? [], [type]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stations;
    // Folder and account included: two stations can share a display name, and
    // the folder is what actually distinguishes them.
    return stations.filter((s) =>
      [s.deviceName, s.organizationName, s.account, s.folderPath].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [stations, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{type?.name ?? 'Stations'}</DialogTitle>
          <DialogDescription>
            {stations.length} station{stations.length === 1 ? '' : 's'} read this format.{' '}
            {canEdit
              ? 'Switching one off stops it ingesting these files — they are quarantined, not lost. Changes take up to a minute to reach the ingest path.'
              : 'Only a platform administrator can change this.'}
          </DialogDescription>
        </DialogHeader>

        {stations.length > 6 ? (
          <div className="flex items-center gap-2 rounded-md border px-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search station, customer or folder…"
              aria-label="Search stations"
              className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
        ) : null}

        <div className="max-h-[52vh] overflow-y-auto rounded-lg border">
          {matches.length === 0 ? (
            <EmptyState
              title={stations.length === 0 ? 'No stations yet' : 'No match'}
              body={
                stations.length === 0
                  ? 'No station is pointed at this format.'
                  : `Nothing matches “${query}”.`
              }
              className="border-0 py-10"
            />
          ) : (
            <ul className="divide-y">
              {matches.map((s) => (
                <li
                  key={s.stationAccountId + s.folderPath}
                  className={cn('flex items-center justify-between gap-3 px-3 py-2.5', !s.enabled && 'bg-muted/40')}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <Radio className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.deviceName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.organizationName}
                        {s.folderPath ? ` · ${s.folderPath}` : ' · upload root'}
                        {/* Which formats share this folder is the thing that
                            makes a per-station switch necessary at all. */}
                        {!s.isDefault ? ' · matched by filename prefix' : ''}
                      </p>
                    </div>
                  </div>

                  {canEdit ? (
                    <label className="flex shrink-0 items-center gap-2 text-xs">
                      <Switch
                        checked={s.enabled}
                        disabled={pendingStationId === s.stationAccountId}
                        onCheckedChange={(v) =>
                          toggle.mutate({ stationAccountId: s.stationAccountId, enabled: v })
                        }
                        aria-label={`${s.enabled ? 'Stop' : 'Allow'} ${s.deviceName} ingesting ${type?.name ?? ''}`}
                      />
                      <span className="w-16 text-muted-foreground">{s.enabled ? 'Ingesting' : 'Stopped'}</span>
                    </label>
                  ) : (
                    <StatusBadge
                      tone={s.enabled ? 'ok' : 'offline'}
                      label={s.enabled ? 'Ingesting' : 'Stopped'}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
