'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Layers, Radio } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/charts/status-badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-states';
import { listStreamTypes } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import type { StreamTypeRow } from '@/lib/api/types';
import { useRbac } from '@/lib/rbac/context';
import { StreamPreviewPanel } from './stream-preview';
import { StationsDialog } from './stations-dialog';

/**
 * What formats the platform can read.
 *
 * The column list is shown because an operator pointing a station at a stream
 * type needs to know which header cells it understands BEFORE data starts
 * arriving — otherwise the first sign of a mismatch is a quarantine folder.
 */
export function StreamTypesPage() {
  const { isSuperAdmin } = useRbac();
  const [expanded, setExpanded] = useState<string | null>(null);
  /**
   * The OPEN DIALOG'S KEY, not the row itself.
   *
   * Holding the row meant holding a snapshot: toggling a station refetched the
   * list and re-rendered this page, but the dialog kept rendering the object
   * captured when it opened, so the switch only moved after a manual reload.
   * Keeping the key and looking the row up below means the dialog always renders
   * whatever the cache currently holds.
   */
  const [stationsForKey, setStationsForKey] = useState<string | null>(null);

  // Two endpoints: the platform one lists every customer's stations, the org one
  // only the caller's. A customer reading the platform endpoint is refused (403),
  // so the choice is a convenience, not the boundary.
  const { data: types, isLoading, isError, refetch } = useQuery({
    queryKey: [...queryKeys.streamTypes, isSuperAdmin] as const,
    queryFn: ({ signal }) => listStreamTypes(isSuperAdmin, signal),
  });

  // Re-derived every render from the live query data — this is what makes the
  // dialog reflect a toggle without a reload.
  const stationsFor: StreamTypeRow | null =
    (stationsForKey ? types?.find((t) => t.key === stationsForKey) : undefined) ?? null;

  // "No stream types — run the seed script" is a badly wrong thing to say when
  // the request simply failed; the formats are built in and always present.
  if (isError) return <ErrorState title="Couldn't load stream types" onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading stream types…" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Stream types</h1>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? 'The file formats this platform can read. Try a sample before pointing a station at one.'
            : 'The file formats your stations send. Open a format to see which of your stations read it.'}
        </p>
      </div>

      {!types?.length ? (
        <EmptyState title="No stream types" body="Run the seed script to register the built-in formats." />
      ) : (
        <div className="space-y-3">
          {types.map((t) => {
            const open = expanded === t.id;
            return (
              <Card key={t.id} data-stream-key={t.key} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <h2 className="font-medium">{t.name}</h2>
                      <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
                      {t.isBuiltIn ? <StatusBadge tone="info" label="Built in" /> : null}
                      {/* A type whose parser is gone would accept stations and
                          then reject every file they send. */}
                      {!t.parserAvailable ? <StatusBadge tone="error" label="No parser installed" /> : null}
                    </div>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.stationCount} station{t.stationCount === 1 ? '' : 's'} · {t.columns.length} column
                      {t.columns.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {/* WHO uses it, behind a click.
                        The names matter — "N stations" is the figure someone
                        acts on before switching a format off — but at eleven
                        stations they were a wall of chips, and that grows with
                        every customer. The dialog carries search and the
                        per-station switch. */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => setStationsForKey(t.key)}
                      disabled={t.stationCount === 0}
                    >
                      <Radio className="h-4 w-4" />
                      View stations ({t.stationCount})
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => setExpanded(open ? null : t.id)}>
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Columns
                    </Button>
                  </div>
                </div>

                {open ? (
                  <div className="mt-4 space-y-3 border-t pt-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-1 pr-4 font-medium">Field</th>
                            <th className="py-1 pr-4 font-medium">Header cells it accepts</th>
                            <th className="py-1 font-medium">Unit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.columns.map((c) => (
                            <tr key={c.field} className="border-b last:border-0">
                              <td className="py-1 pr-4 font-mono text-xs">{c.field}</td>
                              <td className="py-1 pr-4 font-mono text-xs text-muted-foreground">
                                {c.aliases.join(', ')}
                              </td>
                              <td className="py-1 font-mono text-xs">{c.fixedUnit ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <StreamPreviewPanel streamKey={t.key} />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {/* Conditional so the search box does not carry the text typed for the
          PREVIOUS stream type into the next one. */}
      {stationsFor ? (
        <StationsDialog
          type={stationsFor}
          canEdit={isSuperAdmin}
          open
          onOpenChange={(o) => !o && setStationsForKey(null)}
        />
      ) : null}
    </div>
  );
}
