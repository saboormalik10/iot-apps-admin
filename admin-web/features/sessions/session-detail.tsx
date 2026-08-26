'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft } from 'lucide-react';
import type { NepSampleRow } from '@/lib/api/types';
import { sessionCsvHref, sessionsZipHref } from '@/lib/api/endpoints';
import { StatTile } from '@/components/charts/stat-tile';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { DataTable } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { fmt } from '@/components/charts/chart-utils';
import { WaterQualityBadge } from '@/features/analytics-nep/charts/water-quality-badge';
import { CorrelationScatter } from '@/features/analytics-nep/charts/correlation-scatter';
import { SessionTrendChart } from './session-trend-chart';
import { SessionGpsTrail } from './session-gps-trail';
import { SessionEventsPanel } from './session-events-panel';
import { SessionFiles } from './session-files';
import { SessionComment } from './session-comment';
import { ExportMenu } from '@/components/data/export-menu';
import { ShareButton } from '@/features/share/share-button';
import { useSession, useSessionSamples, useSessionTrail } from './use-sessions';

const TABLE_LIMIT = 100;
const fmtDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * NEP session detail (plan §6.1) — the rich session view: a turbidity/temperature
 * trend with a series toggle, avg/min/max cards, a WHO/EPA water-quality badge,
 * battery-over-session, a turbidity-coloured GPS trail, spike events, a paginated
 * samples table, CSV export, and the file gallery + comment.
 */
export function SessionDetail({ id }: { id: string }) {
  const { data: session, isLoading } = useSession(id);
  const { data: viz } = useSessionSamples(id, { downsample: true });
  const [tablePage, setTablePage] = useState(1);
  const { data: tableData, isLoading: tableLoading } = useSessionSamples(id, { page: tablePage, limit: TABLE_LIMIT });

  const vizSamples = useMemo(() => viz?.rows ?? [], [viz]);
  const batteryRows = useMemo(
    () => vizSamples.map((s) => ({ timestamp: s.timestamp, battery: s.batteryLevel })),
    [vizSamples],
  );
  const hasBattery = vizSamples.some((s) => s.batteryLevel != null);

  const { data: trail } = useSessionTrail(id);

  const columns = useMemo<ColumnDef<NepSampleRow, unknown>[]>(
    () => [
      { header: 'Time', cell: ({ row }) => new Date(row.original.timestamp).toLocaleTimeString() },
      { header: 'Turbidity NTU', cell: ({ row }) => fmt(row.original.turbidityValue, 1) },
      { header: 'Temp °C', cell: ({ row }) => fmt(row.original.temperatureValue, 1) },
      { header: 'Probe', cell: ({ row }) => row.original.probeRange ?? '—' },
      { header: 'Battery %', cell: ({ row }) => fmt(row.original.batteryLevel, 0) },
      {
        header: 'GPS',
        cell: ({ row }) =>
          row.original.locationLat != null && row.original.locationLng != null
            ? `${fmt(row.original.locationLat, 4)}, ${fmt(row.original.locationLng, 4)}`
            : '—',
      },
    ],
    [],
  );

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
      <Link href="/sessions">
        <ArrowLeft className="h-3.5 w-3.5" />
        Sessions
      </Link>
    </Button>
  );

  if (isLoading) return <LoadingState label="Loading session…" />;
  if (!session) {
    return (
      <div className="space-y-3">
        {backLink}
        <EmptyState title="Session not found" body="It may have been deleted." />
      </div>
    );
  }

  const durationMin = session.endTimestamp != null ? Math.max(1, Math.round((session.endTimestamp - session.startTimestamp) / 60000)) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {backLink}
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            {session.deviceName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(session.startTimestamp)}
            {session.endTimestamp != null ? ` – ${fmtDate(session.endTimestamp)}` : ''} · {session.sampleCount.toLocaleString()} samples
            {durationMin != null ? ` · ${durationMin} min` : ''}
            {session.probeRange ? ` · Probe ${session.probeRange}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShareButton resourceType="nepSession" resourceId={session.id} resourceLabel={session.deviceName} />
          <ExportMenu
            options={[
              {
                key: 'session-csv',
                label: 'This session (CSV)',
                icon: 'csv',
                href: sessionCsvHref(id),
                hint: `${session.sampleCount.toLocaleString()} samples.`,
              },
              {
                key: 'device-zip',
                label: 'All sessions for this device (ZIP)',
                icon: 'zip',
                href: sessionsZipHref({ deviceId: session.deviceId }),
                hint: 'One CSV per session, plus a photo manifest.',
              },
            ]}
          />
        </div>
      </div>

      {/* Average cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Avg turbidity" value={`${fmt(session.turbidityAvg, 1)}`} sub="NTU" />
        <StatTile label="Min turbidity" value={`${fmt(session.turbidityMin, 1)}`} sub="NTU" />
        <StatTile label="Max turbidity" value={`${fmt(session.turbidityMax, 1)}`} sub="NTU" />
        <StatTile label="Avg temp" value={`${fmt(session.temperatureAvg, 1)}`} sub="°C" />
        <StatTile label="Min temp" value={`${fmt(session.temperatureMin, 1)}`} sub="°C" />
        <StatTile label="Max temp" value={`${fmt(session.temperatureMax, 1)}`} sub="°C" />
      </div>

      {/* Trend + water quality */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SessionTrendChart samples={vizSamples} />
        </div>
        <WaterQualityBadge sessionId={id} />
      </div>

      {/* Battery over session */}
      {hasBattery ? (
        <TimeSeriesChart
          data={batteryRows}
          series={[{ key: 'battery', label: 'Battery %', role: 'chart-4' }]}
          xKey="timestamp"
          title="Battery over session"
          unit="%"
          height={200}
          exportName="session-battery"
        />
      ) : null}

      {/* GPS trail + events */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SessionGpsTrail points={trail?.points ?? []} />
        <SessionEventsPanel sessionId={id} />
      </div>

      {/* Correlation (this session) */}
      <CorrelationScatter deviceId={session.deviceId} sessionId={id} />

      {/* Samples table */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Samples</h3>
        <DataTable
          data={tableData?.rows ?? []}
          columns={columns}
          isLoading={tableLoading}
          page={tableData?.page}
          pageCount={tableData?.pageCount}
          total={tableData?.total}
          onPageChange={setTablePage}
          getRowId={(r) => r._id ?? String(r.timestamp)}
          emptyLabel="No samples."
        />
      </section>

      {/* Comment + files */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SessionComment sessionId={id} comment={session.comment} />
        <SessionFiles sessionId={id} />
      </div>
    </div>
  );
}
