'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Radio, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/charts/status-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { listStations, provisionStation } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import type { PlatformStation } from '@/lib/api/types';

/** Folder names are display-facing — spaces and capitals are expected. */
const TOWER_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/;

function StationRow({ station }: { station: PlatformStation }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{station.folderPath}</div>
        <div className="font-mono text-xs text-muted-foreground">{station.account}</div>
        {station.jobError ? (
          <p className="mt-1 text-xs text-status-error">{station.jobError}</p>
        ) : null}
      </div>
      {/* `isActive` is what matters; the job status only explains a pending one. */}
      {station.isActive ? (
        <StatusBadge tone="ok" label="Receiving" />
      ) : station.status === 'failed' ? (
        <StatusBadge tone="error" label="Failed" />
      ) : (
        <StatusBadge tone="warn" label="Waiting for the agent" />
      )}
    </li>
  );
}

/**
 * Stations for one customer, and the form to add another.
 *
 * Provisioning is asynchronous by design — the backend queues work for the agent
 * on the SFTP box — so a new station appears as "waiting for the agent" rather
 * than pretending to be ready. That distinction is the whole reason the list
 * shows a status at all.
 */
export function StationsDialog({
  organizationId,
  customerName,
  open,
  onOpenChange,
}: {
  organizationId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useApiToast();

  const [towerName, setTowerName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: stations, isLoading } = useQuery({
    queryKey: queryKeys.stations(organizationId),
    queryFn: ({ signal }) => listStations(organizationId, signal),
    enabled: open && Boolean(organizationId),
    // A pending station becomes active when the agent picks the job up, which
    // is seconds away — so this refreshes rather than needing a manual reload.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((s) => !s.isActive && s.status !== 'failed') ? 5_000 : false,
  });

  const provision = useMutation({
    mutationFn: provisionStation,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stations(organizationId) }),
  });

  useEffect(() => {
    if (open) {
      setTowerName('');
      setError(null);
    }
  }, [open, organizationId]);

  async function submit() {
    const name = towerName.trim();
    if (!name) return setError('Give the tower a name.');
    if (!TOWER_RE.test(name)) {
      return setError('Use letters, digits, spaces, dots, hyphens and underscores only.');
    }
    setError(null);
    try {
      const made = await provision.mutateAsync({ organizationId, towerName: name });
      toast.success(`${made.folderPath} queued — the agent will create it shortly`);
      setTowerName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not provision the station.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Stations — {customerName}</DialogTitle>
          <DialogDescription>
            Each station gets a folder on the SFTP server. Files dropped there are routed to this customer.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState label="Loading stations…" />
        ) : !stations?.length ? (
          <EmptyState title="No stations yet" body="Add the first one below." className="border-0 py-6" />
        ) : (
          <ul className="rounded-md border px-3">
            {stations.map((s) => (
              <StationRow key={s.stationAccountId} station={s} />
            ))}
          </ul>
        )}

        <div className="grid gap-2 border-t pt-4">
          <Label htmlFor="tower-name">New station</Label>
          <div className="flex gap-2">
            <Input
              id="tower-name"
              value={towerName}
              onChange={(e) => setTowerName(e.target.value)}
              placeholder="Demo Tower"
              maxLength={64}
            />
            <Button className="shrink-0 gap-1" onClick={submit} disabled={provision.isPending}>
              {provision.isPending ? 'Queuing…' : <><Plus className="h-4 w-4" />Add</>}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The Unix account is derived from the customer. The folder is created on the server by the agent.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-status-error">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
