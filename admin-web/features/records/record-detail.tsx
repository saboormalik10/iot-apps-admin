'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ArrowLeft, Paperclip } from 'lucide-react';
import type { MetMeasureRow } from '@/lib/api/types';
import { recordCsvHref } from '@/lib/api/endpoints';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { SERIES_ROLES, fmt } from '@/components/charts/chart-utils';
import { DataTable } from '@/components/data/data-table';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState, EmptyState, ErrorState } from '@/components/screen-states';
import { isForbiddenError } from '@/lib/api/errors';
import { MEASURE_FIELDS, measureFieldLabel } from './measure-fields';
import { useUnits } from '@/lib/units/use-units';
import { GpsTrackMap } from './gps-track-map';
import { ExportMenu } from '@/components/data/export-menu';
import { ShareButton } from '@/features/share/share-button';
import { useOrg } from '@/features/org/use-org';
import { useRecord, useRecordMeasures, useRecordSeries } from './use-records';
import { useScope } from '@/lib/hooks/use-scope';
import { formatDateTime } from '@/lib/time';
import { zoneLabel } from '@/lib/time/zone-label';
import { mergeMeasureRows } from './merge-measure-rows';
import { describeQc } from './describe-qc';

const VIZ_LIMIT = 2000; // cap the series/map/stats fetch; the table paginates separately
const TABLE_LIMIT = 100;
// Temperature and wind: the two channels with the longest history here, so the
// chart opens with something drawn rather than two empty axes.
const DEFAULT_FIELDS = ['tempC', 'windSpeedMs'];

/**
 * Timestamps read in the STATION's timezone, not the viewer's.
 *
 * Every reading here was recorded against the station's local clock. Rendering
 * it in the browser's zone silently shifts it — a customer in another country
 * would see times that disagree with the record's own day boundary and with
 * everything the station reports.
 */
const fmtDate = (ms: number, tz?: string) => formatDateTime(ms, tz ? { mode: 'device', tz } : {});

/**
 * Record detail (plan §Month 9) — the rich MET record view: a column-picker chart
 * over the full measure set, GPS-quality & power sub-panels, a GPS track map, a
 * raw-NMEA inspector, a paginated measures table, CSV export, and attachments.
 */
export function RecordDetail({ id }: { id: string }) {
  const units = useUnits();
  const { data: record, isLoading: recordLoading, isError, error, refetch } = useRecord(id);
  // Read only for its timezone, so the station day can name the zone it is in.
  const { data: org } = useOrg();
  /**
   * Both the chart and the table read the RANGE the scope bar has selected.
   *
   * Without it, page 1 of a day was simply its first `limit` readings — the
   * first half hour at 1 Hz — whatever range was showing. Temperature and
   * pressure are sampled once a minute, so that slice held a handful of points
   * and the charts looked empty; anything written later in the day was
   * unreachable entirely.
   */
  const { window: scopeWindow } = useScope();
  const measureWindow = useMemo(
    () => ({ from: scopeWindow.from, to: scopeWindow.to }),
    [scopeWindow.from, scopeWindow.to],
  );

  const { data: viz } = useRecordMeasures(id, 1, VIZ_LIMIT, measureWindow);
  const [tablePage, setTablePage] = useState(1);
  const { data: tablePageData, isLoading: tableLoading } = useRecordMeasures(
    id,
    tablePage,
    TABLE_LIMIT,
    measureWindow,
  );

  // A page number means nothing across a different range: staying on page 3 of a
  // narrower window shows an empty table, which reads as "no readings".
  useEffect(() => {
    setTablePage(1);
  }, [measureWindow]);
  const [fields, setFields] = useState<string[]>(DEFAULT_FIELDS);

  /**
   * The chart reads a BUCKETED series, not raw rows.
   *
   * Raw rows are returned oldest-first and capped, so on a 1 Hz record the cap
   * was reached inside the first half hour — and the channels logged once a
   * minute contributed a few dozen points bunched at the left edge while
   * thousands more sat unplotted. Buckets cover the window evenly, so a
   * once-a-minute channel is represented as well as a once-a-second one.
   */
  const { data: series, isLoading: seriesLoading } = useRecordSeries(id, fields, measureWindow);
  const seriesRows = series?.data ?? [];

  const vizRows = useMemo(() => viz?.rows.filter((r) => r.rowType === 'data') ?? [], [viz]);

  /**
   * Wind and environmental readings arrive as separate FILES and are therefore
   * stored as separate rows — so one line in sixty carried a temperature and no
   * wind, which reads as a dropout. Folded together for DISPLAY only; nothing is
   * written, and no reading is discarded (see mergeMeasureRows).
   */
  const tableRows = useMemo(() => mergeMeasureRows(tablePageData?.rows ?? []), [tablePageData]);

  const toggle = (key: string) =>
    setFields((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= 5 ? cur : [...cur, key]));

  const stationTz = org?.timezone || undefined;
  const tzLabel = zoneLabel(stationTz);

  const columns = useMemo<ColumnDef<MetMeasureRow, unknown>[]>(
    () => [
      {
        // The zone is in the HEADER, so every row below it is unambiguous
        // without repeating it 100 times.
        header: `Time${tzLabel ? ` (${tzLabel})` : ''}`,
        cell: ({ row }) =>
          new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: stationTz,
          }).format(new Date(row.original.timestampMs)),
      },
      // Headers carry the ACTIVE unit, not the stored one: a column of numbers
      // silently converted under a "°C" heading is worse than no conversion.
      { header: `Temp ${units.unitFor('°C')}`, cell: ({ row }) => units.format(row.original.tempC, '°C') },
      { header: 'RH %', cell: ({ row }) => fmt(row.original.humidityPct, 0) },
      { header: `Press ${units.unitFor('hPa')}`, cell: ({ row }) => units.format(row.original.pressureHpa, 'hPa') },
      { header: `Wind ${units.unitFor('m/s')}`, cell: ({ row }) => units.format(row.original.windSpeedMs, 'm/s') },
      // Gust beside mean, the way every weather report presents them — a mean
      // alone hides the peak, and the peak alone overstates the conditions.
      { header: `Gust ${units.unitFor('m/s')}`, cell: ({ row }) => units.format(row.original.windGustMs ?? null, 'm/s') },
      { header: `2-min ${units.unitFor('m/s')}`, cell: ({ row }) => units.format(row.original.windSpeedMean2mMs ?? null, 'm/s') },
      {
        header: `10-min ${units.unitFor('m/s')}`,
        cell: ({ row }) => {
          const r = row.original;
          const partial = r.windMean10mMinutes !== undefined && r.windMean10mMinutes < 10;
          return (
            <span
              className={partial ? 'text-muted-foreground' : undefined}
              // A 10-minute mean built from four minutes is not a 10-minute mean.
              // Dimmed and explained rather than presented as complete.
              title={partial ? `Built from ${r.windMean10mMinutes} of 10 minutes` : undefined}
            >
              {units.format(r.windSpeedMean10mMs ?? null, 'm/s')}
              {partial ? '*' : ''}
            </span>
          );
        },
      },
      { header: 'Dir °', cell: ({ row }) => fmt(row.original.windDirTrueDeg, 0) },
      { header: `Dew ${units.unitFor('°C')}`, cell: ({ row }) => units.format(row.original.dewPointC, '°C') },
      {
        header: 'QC',
        /**
         * Why a cell above is blank.
         *
         * A reading that failed QC is stored with that field nulled, so without
         * this column the table shows a gap and gives no reason for it — which
         * looks identical to a sensor that simply was not reporting. The icon
         * carries a text label for screen readers and the full explanation in
         * its tooltip; it is never colour alone.
         */
        cell: ({ row }) => {
          const reason = describeQc(row.original.qc);
          if (!reason) return null;
          return (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500" title={reason}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="sr-only">{reason}</span>
              <span aria-hidden className="text-xs">Flagged</span>
            </span>
          );
        },
      },
    ],
    // `units` matters now: without it the headers and cells would keep the units
    // that were in force when the table first mounted. `stationTz`/`tzLabel` for
    // the same reason — switching customer changes the zone every row is read in.
    [units, stationTz, tzLabel],
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
  if (isError || !record) {
    // A record id can outlive the session that found it — a bookmark, or a
    // platform administrator who switched customer with this page open. That is
    // a 403, not a deletion, and saying "it may have been deleted" about another
    // customer's record is simply untrue.
    return (
      <div className="space-y-3">
        {backLink}
        {isForbiddenError(error) ? (
          <ErrorState
            title="You don't have access to this record"
            body="It belongs to a different customer. Switch back to that organisation to open it."
          />
        ) : isError ? (
          <ErrorState title="Couldn't load this record" onRetry={() => refetch()} />
        ) : (
          <EmptyState title="Record not found" body="It may have been deleted." />
        )}
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
            {fmtDate(record.dateStartMs, stationTz)}
            {record.dateEndMs != null ? ` – ${fmtDate(record.dateEndMs, stationTz)}` : ''} · {record.measureCount.toLocaleString()}{' '}
            measures
          </p>
          {/* The station's own day, named as such.
              A record groups one calendar day AT THE STATION, and that boundary
              is frozen when the data is written. Rendered beside a start time in
              the viewer's timezone it looks contradictory — "2026-09-08" next to
              "Sep 7, 7:00 PM" — so it is labelled with whose day it is and in
              which zone, rather than left as the raw ingest comment. */}
          {record.dayKey ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Station day {record.dayKey}
              {org?.timezone ? ` · ${org.timezone}` : ''}
              {record.source === 'sftp' ? ' · SFTP ingest' : ''}
            </p>
          ) : null}
          {/* A human's note. The ingest comment is machine-written provenance and
              is shown above instead, so it is not repeated here. */}
          {record.comment && !record.dayKey ? <p className="mt-1 text-sm">{record.comment}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <ShareButton resourceType="metRecord" resourceId={record._id} resourceLabel={record.deviceName} />
          <ExportMenu
            options={[
              {
                key: 'record-csv',
                label: 'This record (CSV)',
                icon: 'csv',
                href: recordCsvHref(id),
                hint: `${record.measureCount.toLocaleString()} measures. Re-importable.`,
              },
            ]}
          />
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

      {/* REMOVED (Sept 2026): the GPS-quality and power sub-panels (Satellites,
          HDOP, Fix quality, Voltage, Battery, Current). Every one rendered a
          permanent dash: across 612,246 readings in the last seven days all six
          fields held ZERO values. Nothing in the SFTP/CSV path writes them — they
          come from the mobile BLE heartbeat, and these stations have none. An
          empty tile reads as "the sensor stopped" rather than "not measured",
          which is worse than no tile. Same call as the firmware panel and the
          device-settings page. The fields stay on the model and in the export. */}

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
        {fields.length === 0 ? (
          <EmptyState title="Pick a column" body="Choose up to 5 measure columns to chart." />
        ) : seriesLoading ? (
          <LoadingState label="Loading chart…" />
        ) : seriesRows.length === 0 ? (
          <EmptyState title="No measures" body="This record has no data in the selected range." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {fields.map((key, idx) => {
              const field = MEASURE_FIELDS.find((f) => f.key === key)!;
              // Converted here rather than at the axis: the chart draws whatever
              // it is handed, so the values and the unit label have to move together.
              const rows = seriesRows
                // A bucket with no reading for THIS field is a genuine gap; keeping
                // it as a null point would draw the line down to zero.
                .filter((b) => b[key] !== null && b[key] !== undefined)
                .map((b) => ({
                  timestampMs: b.ts as number,
                  value: units.value(b[key] as number | null, field.unit),
                }));
              return (
                <TimeSeriesChart
                  key={key}
                  data={rows}
                  xKey="timestampMs"
                  unit={units.unitFor(field.unit)}
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
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Measures</h3>
            {/* Said once, because the alternative is someone counting rows and
                concluding the page is dropping them. Wind IS sampled every
                second — it is stored as one row per minute carrying that
                minute's mean, its peak 3-second gust, and the rolling means. */}
            <p className="text-xs text-muted-foreground">
              One row per minute. Wind is sampled every second and summarised here.
            </p>
          </div>
          <DataTable
            data={tableRows}
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
