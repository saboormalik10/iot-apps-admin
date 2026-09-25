'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Database, HardDrive, Radio, Save, Server, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { getSystemStatus } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { formatDateTime, formatRelative } from '@/lib/time';
import { useSiteTimeZone, zoneLabel } from '@/lib/hooks/use-site-timezone';
import type { SystemStatus } from '@/lib/api/types';

/**
 * The site PC's health (Phase 7): is the sensor talking, is the disk filling, did
 * last night's backup work, is the clock plausible. What a technician would
 * otherwise have to sit at the PC to find out. Refreshes every 15 seconds.
 */

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3_600);
  const m = Math.floor((sec % 3_600) / 60);
  return d > 0 ? `${d} d ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

function Section({ icon: Icon, title, state, children }: { icon: typeof Server; title: string; state: ReactNode; children: ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4" aria-hidden /> {title}
        </h2>
        {state}
      </div>
      <dl className="divide-y">{children}</dl>
    </Card>
  );
}

const good = (text: string) => (
  <Badge variant="ok">
    <CheckCircle2 className="h-3 w-3" /> {text}
  </Badge>
);
const bad = (text: string, variant: 'error' | 'warn' = 'error') => (
  <Badge variant={variant}>
    {variant === 'error' ? <XCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} {text}
  </Badge>
);

export function SystemView({ s }: { s: SystemStatus }) {
  const st = s.stream;
  // Times here are the station's, like every other time in the portal — the page
  // used to print the viewer's own zone, unlabelled, next to a header clock
  // showing the station's.
  const tz = useSiteTimeZone();
  const at = (v: string | number) => formatDateTime(v, { mode: 'device', tz });
  const diskUsed = s.disk ? 1 - s.disk.freeBytes / s.disk.totalBytes : null;
  const has = (code: string) => s.warnings.some((w) => w.code === code);

  return (
    <div className="space-y-4">
      {s.warnings.length ? (
        <Card className="space-y-2 border-status-warn p-4" role="alert">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-status-warn-strong" aria-hidden />
            {s.warnings.length === 1 ? '1 thing needs attention' : `${s.warnings.length} things need attention`}
          </h2>
          <ul className="list-disc space-y-1 pl-6 text-sm">
            {s.warnings.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="flex items-center gap-2 p-4 text-sm" role="status">
          <CheckCircle2 className="h-4 w-4 text-status-ok-strong" aria-hidden /> Everything is working.
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          icon={Radio}
          title="Sensor stream"
          state={!st.enabled ? bad('Switched off', 'warn') : st.connected ? good('Connected') : bad('Not connected')}
        >
          <Row label="How it connects">
            {st.mode === 'listen' ? `Converter connects to this PC, port ${st.port ?? '–'}` : `This PC dials ${st.remote ?? '–'}`}
          </Row>
          {st.remoteAddress ? <Row label="Connected from">{st.remoteAddress}</Row> : null}
          <Row label="Last reading">{st.lastReadingAt ? `${formatRelative(st.lastReadingAt)} (${at(st.lastReadingAt)})` : 'none since the service started'}</Row>
          <Row label="Readings in the last minute">{st.readingsLastMinute} (about 60 when healthy)</Row>
          <Row label="Minutes stored since start">{st.minutesWritten.toLocaleString()}</Row>
          <Row label="Rejected: bad checksum">{st.checksumErrors.toLocaleString()}</Row>
          <Row label="Rejected: implausible rain">{st.rainAnomalies.toLocaleString()}</Row>
          {st.error ? <Row label="Problem">{st.error}</Row> : null}
        </Section>

        <Section icon={Save} title="Backup" state={!s.backup ? bad('None yet', 'warn') : !s.backup.ok ? bad('Failed') : has('BACKUP_STALE') ? bad('Late', 'warn') : good('OK')}>
          {s.backup ? (
            <>
              <Row label="Last backup">{`${formatRelative(s.backup.at)} (${at(s.backup.at)})`}</Row>
              <Row label="Size">{formatBytes(s.backup.bytes)}</Row>
              <Row label="Where">
                <span className="break-all font-mono text-xs">{s.backup.path}</span>
              </Row>
              {s.backup.error ? <Row label="Error">{s.backup.error}</Row> : null}
            </>
          ) : (
            <Row label="Last backup">The nightly backup has not run yet.</Row>
          )}
        </Section>

        <Section icon={HardDrive} title="Disk" state={!s.disk ? bad('Unknown', 'warn') : has('DISK_LOW') ? bad('Low', 'warn') : good('OK')}>
          {s.disk ? (
            <>
              <Row label="Free">{`${formatBytes(s.disk.freeBytes)} of ${formatBytes(s.disk.totalBytes)}`}</Row>
              <div className="py-2" aria-hidden>
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${Math.round((diskUsed ?? 0) * 100)}%` }} />
                </div>
              </div>
              <Row label="Data folder">
                <span className="break-all font-mono text-xs">{s.disk.path}</span>
              </Row>
            </>
          ) : (
            <Row label="Free">–</Row>
          )}
          <Row label="Database size">{formatBytes(s.db.storageBytes)}</Row>
        </Section>

        <Section icon={Server} title="This PC" state={has('CLOCK_BEHIND') ? bad('Check the clock', 'warn') : good('OK')}>
          <Row label={`Station time (${zoneLabel(tz)})`}>{at(s.now)}</Row>
          <Row label="The PC's own time zone">{s.pcTimeZone}</Row>
          <Row label="Newest stored minute">{s.db.latestMinuteAt ? at(s.db.latestMinuteAt) : '–'}</Row>
          <Row label="Software">{`Observator Weather Station ${s.version}`}</Row>
          <Row label="Running for">{formatUptime(s.uptimeSec)}</Row>
          <Row label="Database">{s.db.connected ? 'connected' : 'NOT connected'}</Row>
        </Section>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3 w-3" aria-hidden /> Readings are time-stamped with the PC&apos;s clock — keep Windows time
        synchronisation on.
      </p>
    </div>
  );
}

export function SystemPage() {
  const q = useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: ({ signal }) => getSystemStatus(signal),
    refetchInterval: 15_000,
  });
  if (q.isLoading) return <LoadingState label="Checking the system…" />;
  if (q.isError || !q.data) {
    return (
      <Card className="space-y-3 p-6" role="alert">
        <h2 className="flex items-center gap-2 text-base font-medium">
          <XCircle className="h-5 w-5 text-status-error-strong" aria-hidden /> The weather station service is not answering
        </h2>
        <p className="text-sm text-muted-foreground">
          The portal is running, but the service that stores readings and serves this page did not respond. It may be
          stopped, or still starting.
        </p>
        <p className="text-sm text-muted-foreground">
          At the station PC, run <span className="font-mono">status.cmd</span> in the program folder (usually
          <span className="font-mono"> C:\Observator</span>). It says which of the three services is not running and
          where its log is. Readings received while it is down are not lost unless the sensor is disconnected too.
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }
  return <SystemView s={q.data} />;
}
