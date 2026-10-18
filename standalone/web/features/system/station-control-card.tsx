'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Power, Square } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog, type ConfirmRequest } from '@/components/confirm-dialog';
import { getStationState, startStation, stopStation } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { formatDateTime } from '@/lib/time';
import { useSiteTimeZone } from '@/lib/hooks/use-site-timezone';

/**
 * Stop and start the weather station (client, 10 Oct 2026: "Just shut the
 * software. It should have a start and stop server" — "system admin only").
 * Stopping closes the sensor link and stops recording; the portal stays up, which
 * is what lets it be started again here. Shown to the master administrator alone.
 */
const KEY = ['system', 'station'] as const;

export function StationControlCard() {
  const qc = useQueryClient();
  const toast = useApiToast();
  const tz = useSiteTimeZone();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => getStationState(signal), refetchInterval: 15_000 });
  const after = (msg: string) => () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: queryKeys.systemStatus });
    toast.success(msg);
  };
  const stop = useMutation({ mutationFn: stopStation, onSuccess: after('Weather station stopped'), onError: (e) => toast.error(e) });
  const start = useMutation({ mutationFn: startStation, onSuccess: after('Weather station started'), onError: (e) => toast.error(e) });

  if (!q.data?.allowed) return null;
  const { running, stopped } = q.data;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Power className="h-4 w-4" aria-hidden /> Weather station
        </h2>
        {running ? <Badge variant="ok">Running</Badge> : <Badge variant="warn">Stopped</Badge>}
      </div>
      {running ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Receiving and recording readings. Stopping it closes the sensor connection and stops recording; the PC and
            this portal stay on, so you can start it again here.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() =>
              setConfirm({
                title: 'Stop the weather station?',
                body:
                  'The sensor connection is closed and no readings are recorded until you start it again. Readings ' +
                  'already stored are kept, the PC stays on, and this portal stays available. It stays stopped even if ' +
                  'the PC restarts.',
                confirmLabel: 'Stop',
                destructive: true,
                onConfirm: () => stop.mutateAsync().then(() => undefined),
              })
            }
          >
            <Square className="h-4 w-4" aria-hidden /> Stop
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3" role="status">
          <p className="text-sm">
            Stopped by {stopped?.by ?? 'an administrator'}
            {stopped ? `, ${formatDateTime(stopped.at, { mode: 'device', tz })}` : ''}. No readings are being recorded.
          </p>
          <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}>
            <Play className="h-4 w-4" aria-hidden /> Start
          </Button>
        </div>
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </Card>
  );
}
