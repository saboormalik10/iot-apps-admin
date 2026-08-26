'use client';

import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import { dryRunMetImport } from '@/lib/api/endpoints';
import type { ImportDryRun } from '@/lib/api/types';

/**
 * What the SERVER says this import will do.
 *
 * The wizard's own review is computed in the browser, which cannot know two
 * things that decide the outcome: whether these exact bytes have already been
 * ingested, and which local days already hold data. Both are answered here,
 * before the commit — and nothing is written to find out.
 */
export function DryRunPanel({
  file,
  deviceId,
  onResult,
}: {
  file: File;
  deviceId: string | undefined;
  onResult?: (r: ImportDryRun | null) => void;
}) {
  const dryRun = useMutation({
    mutationFn: ({ f, d }: { f: File; d: string }) => dryRunMetImport(f, d),
    onSuccess: (r) => onResult?.(r),
    onError: () => onResult?.(null),
  });

  const { mutate } = dryRun;
  useEffect(() => {
    if (!deviceId) return;
    mutate({ f: file, d: deviceId });
  }, [file, deviceId, mutate]);

  if (!deviceId) {
    return <p className="text-xs text-muted-foreground">Choose a station to check this import against.</p>;
  }

  if (dryRun.isPending) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Checking this file against the station…
      </p>
    );
  }

  if (dryRun.isError) {
    return (
      <p role="alert" className="text-xs text-status-error">
        {dryRun.error instanceof Error ? dryRun.error.message : 'Could not check this file.'}
      </p>
    );
  }

  const r = dryRun.data;
  if (!r) return null;

  if (!r.ok) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-md border border-status-error/40 bg-status-error/10 p-2 text-xs">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-error" aria-hidden />
        <span>The server cannot read this file: {r.reason}. Importing it would store nothing.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border p-2 text-xs">
      {r.duplicateOf ? (
        // The headline case. The same file twice is the mistake this catches.
        <div className="flex items-start gap-2 rounded-md border border-status-warn/40 bg-status-warn/10 p-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warn" aria-hidden />
          <span>
            <strong>Already imported.</strong> These exact contents arrived as{' '}
            <span className="font-mono">{r.duplicateOf.filename}</span> on{' '}
            {new Date(r.duplicateOf.receivedAt).toLocaleString()} ({r.duplicateOf.rows} rows). Importing again
            stores nothing.
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-ok-strong" aria-hidden />
          <span>
            <strong>{r.rowsWouldInsert}</strong> reading{r.rowsWouldInsert === 1 ? '' : 's'} would be added to{' '}
            <strong>{r.deviceName}</strong>.
          </span>
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
        <dt>Days affected</dt>
        <dd className="font-mono text-foreground">
          {r.days.map((d) => `${d.dayKey} (${d.action}${d.action === 'append' ? `, ${d.existingMeasures} existing` : ''})`).join(', ')}
        </dd>
        <dt>Sensors</dt>
        <dd className="font-mono text-foreground">{r.sensorsSeen.join(', ') || '—'}</dd>
        <dt>Time zone</dt>
        {/* Local days, not UTC — an import at 09:00+10:00 belongs to the local
            day, and saying otherwise misreports what it touches. */}
        <dd className="font-mono text-foreground">{r.timezone}</dd>
      </dl>
    </div>
  );
}
