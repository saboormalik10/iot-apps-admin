'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, KeyRound, Copy, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/charts/status-badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { collectStationSecret, listStations, provisionStation, rotateStationPassword } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import type { PlatformStation } from '@/lib/api/types';

/** Folder names are display-facing — spaces and capitals are expected. */
const TOWER_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/;

/**
 * Shows a freshly provisioned SFTP password — once.
 *
 * The password is generated on the box, returned to the API, and never stored:
 * it can be read exactly once and expires after 15 minutes regardless. Until
 * M24 nothing in the panel collected it, so a provisioned station's credentials
 * were simply unreachable — the row went from "Waiting for the agent" to
 * "Receiving" and the secret expired unread. Losing it is recoverable only by
 * rotating, which is why the copy control and the warning are both prominent.
 *
 * Polls because the agent needs a few seconds: the job is queued before the
 * account exists, so the secret is not there on the first ask.
 */
function CredentialPanel({ jobId, account, onDone }: { jobId: string; account: string; onDone: () => void }) {
  const [password, setPassword] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stop = false;
    let tries = 0;
    const tick = async () => {
      if (stop) return;
      tries += 1;
      try {
        const res = await collectStationSecret(jobId);
        if (stop) return;
        if (res.password) return setPassword(res.password);
        // `collected: false` after a fair wait means it expired or was taken.
        if (tries >= 12) return setGone(true);
      } catch {
        if (tries >= 12) return setGone(true);
      }
      setTimeout(tick, 2_500);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [jobId]);

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4" aria-hidden />
        SFTP password for {account}
      </div>

      {password ? (
        <>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-sm">{password}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(password);
                setCopied(true);
              }}
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Shown once and never stored. Copy it now — if it is lost, rotate the password to get a new one.
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={onDone}>
            Done
          </Button>
        </>
      ) : gone ? (
        <p className="text-xs text-status-error">
          The password is no longer available — it is readable once and expires after 15 minutes. Rotate to issue a new one.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Waiting for the agent to create the account…</p>
      )}
    </div>
  );
}

function StationRow({ station, onRotated }: { station: PlatformStation; onRotated: (jobId: string, account: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{station.folderPath}</div>
        <div className="font-mono text-xs text-muted-foreground">{station.account}</div>
        {station.jobError ? (
          <p className="mt-1 text-xs text-status-error">{station.jobError}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Rotation is the ONLY way back to a password — it is never stored, so
            there is nothing to look up. */}
        {station.isActive ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const job = await rotateStationPassword(station.stationAccountId);
                onRotated(job.jobId, station.account);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Rotating…' : 'Rotate password'}
          </Button>
        ) : null}
        {/* `isActive` is what matters; the job status only explains a pending one. */}
        {station.isActive ? (
          <StatusBadge tone="ok" label="Receiving" />
        ) : station.status === 'failed' ? (
          <StatusBadge tone="error" label="Failed" />
        ) : (
          <StatusBadge tone="warn" label="Waiting for the agent" />
        )}
      </div>
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
  /** The job whose one-read password is still waiting to be shown. */
  const [secretJob, setSecretJob] = useState<{ jobId: string; account: string } | null>(null);

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
      setSecretJob(null);
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
      // The password only exists once the agent has run, so hand the job to the
      // panel and let it poll rather than asking for it here and getting null.
      setSecretJob({ jobId: made.jobId, account: made.account });
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

        {secretJob ? (
          <CredentialPanel
            jobId={secretJob.jobId}
            account={secretJob.account}
            onDone={() => setSecretJob(null)}
          />
        ) : null}

        {isLoading ? (
          <LoadingState label="Loading stations…" />
        ) : !stations?.length ? (
          <EmptyState title="No stations yet" body="Add the first one below." className="border-0 py-6" />
        ) : (
          <ul className="rounded-md border px-3">
            {stations.map((s) => (
              <StationRow
                key={s.stationAccountId}
                station={s}
                onRotated={(jobId, account) => setSecretJob({ jobId, account })}
              />
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
