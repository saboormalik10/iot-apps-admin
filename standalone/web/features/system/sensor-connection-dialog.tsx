'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSystemStatus, updateStreamConnection } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import type { StreamConnection } from '@/lib/api/types';

/**
 * How the GMX551's readings reach this PC (client, 9 Oct 2026: his converter is a
 * TCP server, and "there is nothing in the software for me to setup the
 * connection"). Saved on the station and applied at once — then the dialog stays
 * open and shows whether the converter actually answered, because "saved" says
 * nothing about whether the address was right.
 *
 * The listening port is shown, not edited: the installer opened exactly that port
 * in the Windows firewall, and the service has no right to open another.
 */

const HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$|^[0-9A-Fa-f:.]+$/;

export function SensorConnectionDialog({
  current,
  open,
  onOpenChange,
}: {
  current: StreamConnection;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [mode, setMode] = useState(current.mode);
  const [host, setHost] = useState(current.remoteHost ?? '');
  const [port, setPort] = useState(String(current.remotePort || 4000));
  const [errors, setErrors] = useState<{ host?: string; port?: string }>({});
  const [applied, setApplied] = useState(false);
  const [appliedAt, setAppliedAt] = useState(0);
  const qc = useQueryClient();
  const toast = useApiToast();

  const save = useMutation({
    mutationFn: updateStreamConnection,
    onSuccess: () => {
      setApplied(true);
      setAppliedAt(Date.now());
      void qc.invalidateQueries({ queryKey: queryKeys.systemStatus });
    },
    onError: (e) => toast.error(e),
  });

  // After saving: follow the link every 2 seconds until the dialog closes.
  const live = useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: ({ signal }) => getSystemStatus(signal),
    enabled: applied,
    refetchInterval: applied ? 2_000 : false,
  });

  const submit = () => {
    const next: typeof errors = {};
    const h = host.trim();
    const p = Number(port);
    if (mode === 'connect') {
      if (!h) next.host = "Enter the converter's IP address.";
      else if (h.length > 253 || !HOST.test(h)) next.host = 'Enter an IP address such as 192.168.1.50, or a host name.';
      if (!Number.isInteger(p) || p < 1 || p > 65_535) next.port = 'Enter a port from 1 to 65535 (usually 4000).';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(mode === 'connect' ? { mode, remoteHost: h, remotePort: p } : { mode });
  };

  // Only a status fetched after the change: the cached one may still show the old link as connected.
  const st = live.data && live.dataUpdatedAt >= appliedAt ? live.data.stream : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sensor connection</DialogTitle>
          <DialogDescription>How the GMX551&apos;s readings reach this PC through its serial-to-network converter.</DialogDescription>
        </DialogHeader>

        {applied ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <p className="text-sm">
              Saved.{' '}
              {mode === 'connect'
                ? `This PC is now dialling the converter at ${host.trim()}:${Number(port)}.`
                : `This PC is now waiting for the converter on port ${current.listenPort}.`}
            </p>
            <div className="flex items-start gap-2 rounded-md border p-3 text-sm">
              {!st || (!st.connected && !st.error) ? (
                <>
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  <span>{mode === 'connect' ? 'Connecting to the converter…' : 'Waiting for the converter to connect…'}</span>
                </>
              ) : st.connected ? (
                <>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-ok-strong" aria-hidden />
                  <span>
                    Connected{st.remoteAddress ? ` (${st.remoteAddress})` : ''}.{' '}
                    {st.readingsLastMinute > 0
                      ? `${st.readingsLastMinute} readings in the last minute — about 60 when healthy.`
                      : 'No readings yet — they should start within a few seconds.'}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-error-strong" aria-hidden />
                  <span>
                    {st.error} It keeps trying by itself. Check the address and port, that the converter is on, and that it
                    is set to TCP Server.
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <fieldset className="space-y-2" role="radiogroup" aria-label="Who connects">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <input
                  type="radio"
                  name="stream-mode"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={mode === 'connect'}
                  onChange={() => setMode('connect')}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">This PC connects to the converter</span>
                  <span className="block text-xs text-muted-foreground">
                    The converter is set to <strong>TCP Server</strong>. Enter its address below.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <input
                  type="radio"
                  name="stream-mode"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={mode === 'listen'}
                  onChange={() => setMode('listen')}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">The converter connects to this PC</span>
                  <span className="block text-xs text-muted-foreground">
                    The converter is set to <strong>TCP Client</strong>, sending to this PC&apos;s IP address on port{' '}
                    {current.listenPort}.
                  </span>
                </span>
              </label>
            </fieldset>

            {mode === 'connect' ? (
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <div className="space-y-1">
                  <label htmlFor="conv-host" className="text-sm font-medium">Converter IP address</label>
                  <Input
                    id="conv-host"
                    placeholder="192.168.1.50"
                    autoComplete="off"
                    spellCheck={false}
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    aria-invalid={Boolean(errors.host)}
                  />
                  {errors.host ? <p className="text-xs text-status-error-strong">{errors.host}</p> : null}
                </div>
                <div className="space-y-1">
                  <label htmlFor="conv-port" className="text-sm font-medium">Port</label>
                  <Input
                    id="conv-port"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={65_535}
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    aria-invalid={Boolean(errors.port)}
                  />
                  {errors.port ? <p className="text-xs text-status-error-strong">{errors.port}</p> : null}
                </div>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Applies at once — the current link is closed and the new one opened. Readings already stored are not
              affected.
            </p>
          </div>
        )}

        <DialogFooter>
          {applied ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Save and connect
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
