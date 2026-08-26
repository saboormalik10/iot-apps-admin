'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/charts/status-badge';
import { EmptyState, LoadingState } from '@/components/screen-states';
import { listStreamTypes, setStreamTypeEnabled } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useRbac } from '@/lib/rbac/context';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { StreamPreviewPanel } from './stream-preview';

/**
 * What formats the platform can read.
 *
 * The column list is shown because an operator pointing a station at a stream
 * type needs to know which header cells it understands BEFORE data starts
 * arriving — otherwise the first sign of a mismatch is a quarantine folder.
 */
export function StreamTypesPage() {
  const { isSuperAdmin } = useRbac();
  const qc = useQueryClient();
  const toast = useApiToast();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: types, isLoading } = useQuery({
    queryKey: queryKeys.streamTypes,
    queryFn: ({ signal }) => listStreamTypes(signal),
    enabled: isSuperAdmin,
  });

  const toggle = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) => setStreamTypeEnabled(id, isEnabled),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: queryKeys.streamTypes });
      toast.success(r.isEnabled ? `${r.key} enabled` : `${r.key} disabled`);
    },
  });

  if (!isSuperAdmin) {
    return <EmptyState title="Not available" body="This page is for platform administrators." />;
  }
  if (isLoading) return <LoadingState label="Loading stream types…" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Stream types</h1>
        <p className="text-sm text-muted-foreground">
          The file formats this platform can read. Try a sample before pointing a station at one.
        </p>
      </div>

      {!types?.length ? (
        <EmptyState title="No stream types" body="Run the seed script to register the built-in formats." />
      ) : (
        <div className="space-y-3">
          {types.map((t) => {
            const open = expanded === t.id;
            return (
              <Card key={t.id} className="p-4">
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

                  <div className="flex shrink-0 items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={t.isEnabled}
                        disabled={toggle.isPending || !t.parserAvailable}
                        onCheckedChange={(v) => toggle.mutate({ id: t.id, isEnabled: v })}
                        aria-label={`${t.isEnabled ? 'Disable' : 'Enable'} ${t.name}`}
                      />
                      {t.isEnabled ? 'Enabled' : 'Disabled'}
                    </label>
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
    </div>
  );
}
