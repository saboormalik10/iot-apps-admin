'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileUp,
  Info,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DeviceSelect } from '@/components/data/device-select';
import { DryRunPanel } from './dry-run-panel';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { ImportSummary } from '@/lib/api/types';
import {
  ACCEPTED_MIME,
  HEADERS,
  KIND_DEVICE_TYPE,
  MAX_FILE_BYTES,
  detectKind,
  dryRun,
  type DryRunResult,
  type ImportKind,
} from './csv-contract';
import { useImportCsv } from './use-import';

type Step = 'select' | 'review' | 'done';

const KIND_LABEL: Record<ImportKind, string> = {
  nep: 'NEP-Link sessions',
  met: 'MET-Link measures',
};

const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/**
 * CSV import wizard (plan §Month 12): select → review → done.
 *
 * "Review" is computed in the BROWSER by `csv-contract.ts`, which mirrors the
 * backend parser — that gives instant feedback while a file is being chosen.
 *
 * Since M22 W4 it is joined by a SERVER dry-run (`DryRunPanel`), which answers
 * the two questions the browser cannot: whether these exact bytes have already
 * been ingested, and which local days already hold data. Neither writes
 * anything; submitting from the review step is still what commits.
 */
export function ImportWizard() {
  const [step, setStep] = useState<Step>('select');
  // MET, not NEP: NEP import was switched off platform-wide in M15 W4, so
  // defaulting to it meant every user landed on a dead option and had to click
  // away from it. Detection overrides this whenever the header is recognisable.
  const [kind, setKind] = useState<ImportKind>('met');
  const [file, setFile] = useState<File | null>(null);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [text, setText] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const importer = useImportCsv();

  const analysis: DryRunResult | null = useMemo(
    () => (text ? dryRun(kind, text) : null),
    [text, kind],
  );

  const reset = () => {
    setStep('select');
    setFile(null);
    setText('');
    setSummary(null);
    setReadError(null);
    importer.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  const accept = useCallback(async (f: File) => {
    setReadError(null);
    if (f.size > MAX_FILE_BYTES) {
      setReadError(`“${f.name}” is ${formatBytes(f.size)}. The importer accepts files up to 20 MB.`);
      return;
    }
    if (f.size === 0) {
      setReadError(`“${f.name}” is empty.`);
      return;
    }
    let content: string;
    try {
      content = await f.text();
    } catch {
      setReadError(`Could not read “${f.name}”.`);
      return;
    }
    const detected = detectKind(content);
    setFile(f);
    setText(content);
    // A detected kind wins: it's read from the header, which is what the backend
    // keys on. Leave the current choice when the header is unrecognizable.
    if (detected) setKind(detected);
    setDeviceId(undefined);
    setStep('review');
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void accept(f);
  };

  const submit = async () => {
    if (!file || !deviceId) return;
    try {
      const result = await importer.mutateAsync({ kind, file, deviceId });
      setSummary(result);
      setStep('done');
    } catch {
      // The error renders inline on the review step (see below) — the user needs
      // it next to the file/device that caused it, not in a toast that vanishes.
    }
  };

  return (
    <div className="space-y-4">
      <Stepper step={step} />

      {step === 'select' && (
        <SelectStep
          dragging={dragging}
          setDragging={setDragging}
          onDrop={onDrop}
          onPick={accept}
          inputRef={inputRef}
          readError={readError}
        />
      )}

      {step === 'review' && analysis && file && (
        <ReviewStep
          analysis={analysis}
          file={file}
          kind={kind}
          setKind={setKind}
          deviceId={deviceId}
          setDeviceId={setDeviceId}
          onBack={reset}
          onSubmit={submit}
          pending={importer.isPending}
          progress={importer.progress}
          error={importer.error}
        />
      )}

      {step === 'done' && summary && analysis && (
        <DoneStep summary={summary} kind={kind} predicted={analysis} onAgain={reset} />
      )}
    </div>
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'select', label: 'Choose file' },
    { key: 'review', label: 'Review' },
    { key: 'done', label: 'Result' },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Import progress">
      {steps.map((s, i) => {
        const state = i < activeIndex ? 'complete' : i === activeIndex ? 'current' : 'upcoming';
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1',
                state === 'current' && 'bg-muted font-medium text-foreground',
                state !== 'current' && 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-xs',
                  state === 'complete' && 'border-status-ok bg-status-ok text-white',
                  state === 'current' && 'border-foreground',
                )}
              >
                {state === 'complete' ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              {s.label}
              <span className="sr-only">{state === 'complete' ? ' (completed)' : ''}</span>
            </span>
            {i < steps.length - 1 && <span aria-hidden className="h-px w-6 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function SelectStep({
  dragging,
  setDragging,
  onDrop,
  onPick,
  inputRef,
  readError,
}: {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onPick: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  readError: string | null;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <FileUp className="h-8 w-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">Drop a CSV here, or choose a file</p>
            <p className="text-sm text-muted-foreground">
              NEP-Link session exports and MET-Link measure exports, up to 20 MB. We detect which from the header.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={[...ACCEPTED_MIME, '.csv'].join(',')}
            className="sr-only"
            id="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
          <Button asChild variant="outline">
            <label htmlFor="import-file" className="cursor-pointer">
              Choose file
            </label>
          </Button>
        </div>

        {readError && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-status-danger">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {readError}
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(['nep', 'met'] as ImportKind[]).map((k) => (
            <div key={k} className="rounded-md border p-3">
              <p className="text-sm font-medium">{KIND_LABEL[k]}</p>
              <p className="mt-1 text-xs text-muted-foreground" id={`hdr-${k}`}>
                Expected columns
              </p>
              {/* tabIndex + role: the block scrolls sideways, and a scrollable
                  region that can't be focused is unreachable by keyboard. */}
              <code
                tabIndex={0}
                role="region"
                aria-labelledby={`hdr-${k}`}
                className="mt-1 block overflow-x-auto whitespace-nowrap rounded bg-muted p-2 text-xs"
              >
                {HEADERS[k].join(',')}
              </code>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewStep({
  analysis,
  file,
  kind,
  setKind,
  deviceId,
  setDeviceId,
  onBack,
  onSubmit,
  pending,
  progress,
  error,
}: {
  analysis: DryRunResult;
  file: File;
  kind: ImportKind;
  setKind: (k: ImportKind) => void;
  deviceId: string | undefined;
  setDeviceId: (id: string | undefined) => void;
  onBack: () => void;
  onSubmit: () => void;
  pending: boolean;
  progress: number;
  error: unknown;
}) {
  const blocked = analysis.errors.length > 0;
  const canSubmit = !blocked && Boolean(deviceId) && !pending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            {file.name} <span className="font-normal text-muted-foreground">· {formatBytes(file.size)}</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onBack} disabled={pending}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Choose another
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="import-kind">File type</Label>
              <div className="flex gap-2" id="import-kind">
                {(['nep', 'met'] as ImportKind[]).map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={kind === k ? 'default' : 'outline'}
                    aria-pressed={kind === k}
                    disabled={pending}
                    onClick={() => {
                      setKind(k);
                      setDeviceId(undefined); // device type changes with the kind
                    }}
                  >
                    {KIND_LABEL[k]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Detected from the header. Change it if we guessed wrong.</p>
            </div>

            <div className="space-y-1">
              <Label>Import into device</Label>
              <DeviceSelect
                value={deviceId}
                onChange={setDeviceId}
                type={KIND_DEVICE_TYPE[kind]}
                allowAll={false}
                ariaLabel="Import into device"
                placeholder={`Select a ${KIND_DEVICE_TYPE[kind]} device`}
              />
              <p className="text-xs text-muted-foreground">
                Only {KIND_DEVICE_TYPE[kind]} devices — the backend rejects a mismatched type.
              </p>
            </div>

            {/* The SERVER's answer, alongside the browser's. The review above is
                computed locally and cannot know whether these exact bytes were
                already ingested, nor which local days already hold data. */}
            {kind === 'met' ? (
              <div className="space-y-1">
                <Label>What this will do</Label>
                <DryRunPanel file={file} deviceId={deviceId} />
              </div>
            ) : null}
          </div>

          <Findings analysis={analysis} />
        </CardContent>
      </Card>

      {analysis.validRows > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted-foreground">
              First {analysis.preview.length} of {analysis.validRows.toLocaleString()} rows that will import.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {analysis.header.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.preview.map((row, i) => (
                    <TableRow key={i}>
                      {analysis.header.map((h) => (
                        <TableCell key={h} className="whitespace-nowrap font-mono text-xs">
                          {row[h] === '' ? <span className="text-muted-foreground">—</span> : row[h]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {error != null && (
        <p role="alert" className="flex items-start gap-2 text-sm text-status-danger">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error instanceof Error ? error.message : 'The import failed.'}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {pending
            ? progress < 1
              ? `Uploading… ${Math.round(progress * 100)}%`
              : 'Uploaded. The server is processing the file…'
            : blocked
              ? 'Fix the problems above to continue.'
              : deviceId
                ? `Ready to import ${analysis.validRows.toLocaleString()} rows.`
                : 'Choose a device to continue.'}
        </p>
        <Button onClick={onSubmit} disabled={!canSubmit}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Import {analysis.validRows.toLocaleString()} rows
        </Button>
      </div>

      {pending && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Upload progress"
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${Math.max(2, progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Findings({ analysis }: { analysis: DryRunResult }) {
  const { errors, warnings, issues, validRows, totalRows, sessionIds, timeRange, kind } = analysis;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{totalRows.toLocaleString()} data rows</Badge>
        <Badge variant={validRows === totalRows ? 'outline' : 'secondary'}>
          {validRows.toLocaleString()} will import
        </Badge>
        {totalRows - validRows > 0 && (
          <Badge variant="secondary">{(totalRows - validRows).toLocaleString()} skipped</Badge>
        )}
        {kind === 'nep' && sessionIds.length > 0 && (
          <Badge variant="outline">{sessionIds.length.toLocaleString()} sessions</Badge>
        )}
        {timeRange && (
          <Badge variant="outline">
            {formatDateTime(timeRange.from)} → {formatDateTime(timeRange.to)}
          </Badge>
        )}
      </div>

      {timeRange && (
        <Note tone="info">
          {kind === 'nep' ? (
            <>
              Sessions are matched by <code>SessionId</code>, so re-importing this file updates the same sessions
              instead of duplicating them.
            </>
          ) : (
            <>
              {/* WAS: "MET imports are not de-duplicated — importing this file
                  twice creates two records." That stopped being true in M15 W4,
                  when the admin upload was unified onto the ingest core and its
                  content-hash ledger. It then contradicted the server's own
                  dry-run panel, which correctly reported the same file as
                  already imported. */}
              Measures are added to the day they belong to. Re-importing the same file changes nothing — it is
              matched by content, not by name.
            </>
          )}
        </Note>
      )}

      {errors.map((e) => (
        <Note key={e} tone="error">
          {e}
        </Note>
      ))}
      {warnings.map((w) => (
        <Note key={w} tone="warning">
          {w}
        </Note>
      ))}

      {issues.length > 0 && (
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {issues.length >= 50 ? 'First 50 skipped rows' : `${issues.length} skipped ${issues.length === 1 ? 'row' : 'rows'}`}
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
            {issues.map((iss) => (
              <li key={iss.line}>
                Row {iss.line}: {iss.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Note({ tone, children }: { tone: 'info' | 'warning' | 'error'; children: React.ReactNode }) {
  const Icon = tone === 'error' ? XCircle : tone === 'warning' ? AlertTriangle : Info;
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2 rounded-md border p-2 text-sm',
        tone === 'error' && 'border-status-danger/30 bg-status-danger/5 text-status-danger',
        tone === 'warning' && 'border-status-warn/30 bg-status-warn/5 text-foreground',
        tone === 'info' && 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function DoneStep({
  summary,
  kind,
  predicted,
  onAgain,
}: {
  summary: ImportSummary;
  kind: ImportKind;
  predicted: DryRunResult;
  onAgain: () => void;
}) {
  const clean = summary.skipped === 0 && summary.errors.length === 0;
  // The dry-run predicts what the server will do; a mismatch means our mirror of
  // the backend parser has drifted, and the user should not have to guess.
  const drifted = summary.inserted !== predicted.validRows;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start gap-3">
          {clean ? (
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-status-ok" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-status-warn" aria-hidden />
          )}
          <div>
            <h2 className="font-medium">{clean ? 'Import complete' : 'Imported with skipped rows'}</h2>
            <p className="text-sm text-muted-foreground">
              {kind === 'nep'
                ? `${summary.inserted.toLocaleString()} samples across ${summary.upserted.toLocaleString()} session(s).`
                : `${summary.inserted.toLocaleString()} measures in 1 new record.`}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3">
          {[
            { label: kind === 'nep' ? 'Samples inserted' : 'Measures inserted', value: summary.inserted },
            { label: kind === 'nep' ? 'Sessions upserted' : 'Records created', value: summary.upserted },
            { label: 'Rows skipped', value: summary.skipped },
          ].map((s) => (
            <div key={s.label} className="rounded-md border p-3">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{s.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>

        {drifted && (
          <Note tone="warning">
            The preview expected {predicted.validRows.toLocaleString()} rows but the server imported{' '}
            {summary.inserted.toLocaleString()}. Check the imported data before relying on it.
          </Note>
        )}

        {summary.errors.length > 0 && (
          <details className="rounded-md border p-3 text-sm" open>
            <summary className="cursor-pointer font-medium">
              {summary.errors.length} row {summary.errors.length === 1 ? 'message' : 'messages'} from the server
            </summary>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
              {summary.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        )}

        <Button onClick={onAgain}>Import another file</Button>
      </CardContent>
    </Card>
  );
}
