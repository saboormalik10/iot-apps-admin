'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Download, Paperclip } from 'lucide-react';
import type { MetMeasureRow } from '@/lib/api/types';
import { recordCsvHref } from '@/lib/api/endpoints';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { SERIES_ROLES, fmt } from '@/components/charts/chart-utils';
import { StatTile } from '@/components/charts/stat-tile';
import { DataTable } from '@/components/data/data-table';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { MEASURE_FIELDS, measureFieldLabel } from './measure-fields';
import { GpsTrackMap } from './gps-track-map';
import { ShareButton } from '@/features/share/share-button';
import { useRecord, useRecordMeasures } from './use-records';

const VIZ_LIMIT = 2000; // cap the series/map/stats fetch; the table paginates separately
const TABLE_LIMIT = 100;
const DEFAULT_FIELDS = ['tempC', 'pressureHpa'];

const avg = (rows: MetMeasureRow[], key: keyof MetMeasureRow): number | null => {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === 'number') {
      sum += v;
      n++;
    }
  }
  return n ? sum / n : null;
};
const last = (rows: MetMeasureRow[], key: keyof MetMeasureRow): number | null => {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (typeof v === 'number') return v;
  }
  return null;
};
const fmtDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Record detail (plan §Month 9) — the rich MET record view: a column-picker chart
 * over the full measure set, GPS-quality & power sub-panels, a GPS track map, a
 * raw-NMEA inspector, a paginated measures table, CSV export, and attachments.
 */
export function RecordDetail({ id }: { id: string }) {
  const { data: record, isLoading: recordLoading } = useRecord(id);
  const { data: viz } = useRecordMeasures(id, 1, VIZ_LIMIT);
  const [tablePage, setTablePage] = useState(1);
  const { data: tablePageData, isLoading: tableLoading } = useRecordMeasures(id, tablePage, TABLE_LIMIT);
  const [fields, setFields] = useState<string[]>(DEFAULT_FIELDS);

  const vizRows = useMemo(() => viz?.rows.filter((r) => r.rowType === 'data') ?? [], [viz]);

  const toggle = (key: string) =>
    setFields((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= 5 ? cur : [...cur, key]));

  const columns = useMemo<ColumnDef<MetMeasureRow, unknown>[]>(
    () => [
      { header: 'Time', cell: ({ row }) => new Date(row.original.timestampMs).toLocaleTimeString() },
      { header: 'Temp °C', cell: ({ row }) => fmt(row.original.tempC, 1) },
      { header: 'RH %', cell: ({ row }) => fmt(row.original.humidityPct, 0) },
      { header: 'Press hPa', cell: ({ row }) => fmt(row.original.pressureHpa, 1) },
      { header: 'Wind m/s', cell: ({ row }) => fmt(row.original.windSpeedMs, 1) },
      { header: 'Dir °', cell: ({ row }) => fmt(row.original.windDirTrueDeg, 0) },
      { header: 'Dew °C', cell: ({ row }) => fmt(row.original.dewPointC, 1) },
    ],
    [],
  );

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
      <Link href="/records">
        <ArrowLeft className="h-3.5 w-3.5" />
        Records
      </Link>
    </Button>
  );

  if (recordLoading) return <LoadingState label="Loading record…" />;
  if (!record) {
    return (
      <div className="space-y-3">
        {backLink}
        <EmptyState title="Record not found" body="It may have been deleted." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {backLink}
          <h1 className="mt-1 text-2xl font-semibold">{record.deviceName}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(record.dateStartMs)}
            {record.dateEndMs != null ? ` – ${fmtDate(record.dateEndMs)}` : ''} · {record.measureCount.toLocaleString()}{' '}
            measures{record.isDemoMode ? ' · demo' : ''}
          </p>
          {record.comment ? <p className="mt-1 text-sm">{record.comment}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <ShareButton resourceType="metRecord" resourceId={record._id} resourceLabel={record.deviceName} />
          <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs">
            <a href={recordCsvHref(id)} download>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>

      {record.urlMaps ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <a href={record.urlMaps} target="_blank" rel="noreferrer" className="text-primary underline">
            Attachment / map
          </a>
        </Card>
      ) : null}

      {/* GPS-quality + power sub-panels */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Satellites" value={fmt(last(vizRows, 'gpsSatellites'), 0)} sub={`avg ${fmt(avg(vizRows, 'gpsSatellites'), 1)}`} />
        <StatTile label="HDOP" value={fmt(last(vizRows, 'gpsHorDilution'), 1)} />
        <StatTile label="Fix quality" value={fmt(last(vizRows, 'gpsQuality'), 0)} />
        <StatTile label="Voltage" value={`${fmt(last(vizRows, 'voltageV'), 2)} V`} />
        <StatTile label="Battery" value={`${fmt(last(vizRows, 'batteryVoltageV'), 2)} V`} />
        <StatTile label="Current" value={`${fmt(last(vizRows, 'currentA'), 2)} A`} />
      </div>

      {/* Column-picker chart (small multiples) */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Measures chart</h3>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Measure columns">
          {MEASURE_FIELDS.map((f) => {
            const on = fields.includes(f.key);
            return (
              <Button
                key={f.key}
                size="sm"
                variant={on ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => toggle(f.key)}
                aria-pressed={on}
                disabled={!on && fields.length >= 5}
              >
                {f.label}
              </Button>
            );
          })}
        </div>
        {vizRows.length === 0 ? (
          <EmptyState title="No measures" body="This record has no data rows to plot." />
        ) : fields.length === 0 ? (
          <EmptyState title="Pick a column" body="Choose up to 5 measure columns to chart." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((key, idx) => {
              const field = MEASURE_FIELDS.find((f) => f.key === key)!;
              const rows = vizRows.map((m) => ({ timestampMs: m.timestampMs, value: m[key as keyof MetMeasureRow] as number | null }));
              return (
                <TimeSeriesChart
                  key={key}
                  data={rows}
                  xKey="timestampMs"
                  unit={field.unit}
                  title={measureFieldLabel(key)}
                  series={[{ key: 'value', label: field.label, role: SERIES_ROLES[idx % SERIES_ROLES.length] }]}
                  height={200}
                  exportName={`record-${key}`}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* GPS track */}
      <GpsTrackMap measures={vizRows} />

      {/* Measures table + raw-NMEA inspector */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Measures</h3>
          <DataTable
            data={tablePageData?.rows ?? []}
            columns={columns}
            isLoading={tableLoading}
            page={tablePageData?.page}
            pageCount={tablePageData?.pageCount}
            total={tablePageData?.total}
            onPageChange={setTablePage}
            getRowId={(r) => r._id}
            emptyLabel="No measures."
          />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Raw NMEA</h3>
          <Card className="max-h-[420px] overflow-auto p-3">
            <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-muted-foreground">
              {(tablePageData?.rows ?? []).map((r) => r.dataSentence).join('\n') || 'No sentences on this page.'}
            </pre>
          </Card>
        </div>
      </section>
    </div>
  );
}
