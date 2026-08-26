'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileCheck2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/charts/status-badge';
import { previewStream } from '@/lib/api/endpoints';
import type { StreamPreview } from '@/lib/api/types';

/**
 * Try a sample file against a stream type before any data depends on it.
 *
 * The alternative way to answer "will this file work?" is to point a station at
 * it and read the quarantine folder — after the customer has started sending.
 * Nothing here is written: the response says so, and the UI repeats it.
 */
export function StreamPreviewPanel({ streamKey }: { streamKey: string }) {
  const [content, setContent] = useState('');
  const [filename, setFilename] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StreamPreview | null>(null);

  const preview = useMutation({ mutationFn: previewStream, onSuccess: setResult });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1_048_576) return setError('That file is larger than 1 MB. A sample of a few rows is enough.');
    setError(null);
    setFilename(file.name);
    setContent(await file.text());
  }

  async function run() {
    if (!content.trim()) return setError('Paste a few rows, or choose a file.');
    setError(null);
    setResult(null);
    try {
      await preview.mutateAsync({ streamKey, content, filename });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that sample.');
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={`sample-${streamKey}`} className="flex items-center gap-1.5">
          <FileCheck2 className="h-4 w-4" aria-hidden />
          Try a sample file
        </Label>
        <input
          id={`sample-${streamKey}`}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={onFile}
          className="text-xs file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1 file:text-xs"
        />
      </div>

      <textarea
        aria-label="Sample rows"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        placeholder={'timestamp,direction,speed,units,status\n2026-08-25T11:19:00+10:00,350,0.50,K,A'}
        className="w-full rounded-md border bg-background p-2 font-mono text-xs"
      />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={run} disabled={preview.isPending}>
          {preview.isPending ? 'Reading…' : 'Preview'}
        </Button>
        <span className="text-xs text-muted-foreground">Nothing is saved.</span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-2 border-t pt-3 text-sm">
          {result.ok ? (
            <StatusBadge
              tone="ok"
              label={`${result.totalRows} row${result.totalRows === 1 ? '' : 's'} would be stored`}
            />
          ) : (
            <StatusBadge tone="error" label={`Cannot be read: ${result.rejectReason ?? 'unknown'}`} />
          )}

          {result.ignoredColumns.length ? (
            <div className="flex items-start gap-2 rounded-md border border-status-warn/40 bg-status-warn/10 p-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warn" aria-hidden />
              {/* Named rather than silently dropped: this is the answer to "why
                  is my sensor missing from the dashboard?". */}
              <span>
                Ignored, because this stream type does not recognise them:{' '}
                <span className="font-mono">{result.ignoredColumns.join(', ')}</span>
              </span>
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Recognised</dt>
            <dd className="font-mono">{result.recognisedColumns.join(', ') || '—'}</dd>
            <dt className="text-muted-foreground">Sensors detected</dt>
            <dd className="font-mono">{result.sensorsSeen.join(', ') || '—'}</dd>
            <dt className="text-muted-foreground">Speed unit</dt>
            <dd className="font-mono">{result.unitCode ?? '—'}</dd>
            <dt className="text-muted-foreground">Rows skipped</dt>
            <dd className="font-mono">{result.stats.skipped}</dd>
          </dl>

          {result.sampleRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Timestamp</th>
                    <th className="py-1 pr-3 font-medium">Speed m/s</th>
                    <th className="py-1 pr-3 font-medium">Direction</th>
                    <th className="py-1 font-medium">Temp °C</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.sampleRows.map((r) => (
                    <tr key={r.timestampMs} className="border-b last:border-0">
                      <td className="py-1 pr-3">{r.timestamp}</td>
                      <td className="py-1 pr-3">{r.windSpeedMs ?? '—'}</td>
                      <td className="py-1 pr-3">{r.windDirRelDeg ?? '—'}</td>
                      <td className="py-1">{r.tempC ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
