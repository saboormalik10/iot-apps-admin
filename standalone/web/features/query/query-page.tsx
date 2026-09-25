'use client';

import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Play } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/data/data-table';
import { EmptyState, LoadingState } from '@/components/screen-states';
import { Can } from '@/lib/rbac/guard';
import { formatDate, formatDateTime } from '@/lib/time';
import { getQueryColumns, queryCsvHref, runQuery, type QueryParams } from '@/lib/api/endpoints';
import type { QueryResolution, QueryRow } from '@/lib/api/types';
import { queryKeys } from '@/lib/query/keys';
import { useScopedDevice } from '@/features/dashboard/use-scoped-device';
import { msToZonedInput, zonedInputToMs } from './zoned-time';

/**
 * The query screen (client, 21 Sep 2026): *"a query screen allowing users to
 * choose the parameters they want and download as csv file. You can display the
 * data also on screen in tabular format."*
 *
 * Choose a period, one row per minute / hour / day, and the columns; SHOW puts
 * those rows in the table and arms the CSV download with exactly the same query —
 * the server builds both from one code path, so they cannot disagree.
 *
 * Times are the STATION's (see zoned-time.ts). Hours and days are built from the
 * stored minutes: means, a vector-mean wind direction, the highest gust, and rain
 * as a total. A day starts at the station's rain-day hour.
 */

const RESOLUTION_LABEL: Record<QueryResolution, string> = {
  minute: 'Every minute',
  hour: 'Every hour',
  day: 'Every day',
};

/** Ticked by default: the headline weather, without the specialist wind means. */
const DEFAULT_COLUMNS = ['windSpeed', 'windDir', 'windGust', 'temperature', 'humidity', 'pressure', 'rain'];

const QUICK_RANGES = [
  { label: 'Last 24 hours', ms: 24 * 3_600_000 },
  { label: 'Last 7 days', ms: 7 * 24 * 3_600_000 },
  { label: 'Last 30 days', ms: 30 * 24 * 3_600_000 },
];

const fmtValue = (v: number | null | undefined) =>
  v === null || v === undefined ? '–' : v.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function QueryPage() {
  const station = useScopedDevice('MET-LINK');
  const deviceId = station.deviceId;

  const columnsInfo = useQuery({
    queryKey: queryKeys.queryColumns(deviceId ?? ''),
    queryFn: ({ signal }) => getQueryColumns(deviceId!, signal),
    enabled: Boolean(deviceId),
  });
  const timezone = columnsInfo.data?.timezone ?? 'UTC';
  const dayHour = columnsInfo.data?.rainDayStartHour ?? 0;

  // ── The form (draft) ──
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [resolution, setResolution] = useState<QueryResolution>('hour');
  const [fields, setFields] = useState<string[]>([]);

  // Seed the form once the station's timezone and columns are known.
  useEffect(() => {
    if (!columnsInfo.data || fromInput) return;
    const now = Date.now();
    setFromInput(msToZonedInput(now - 24 * 3_600_000, timezone));
    setToInput(msToZonedInput(now, timezone));
    const offered = new Set(columnsInfo.data.columns.map((c) => c.key));
    setFields(DEFAULT_COLUMNS.filter((k) => offered.has(k)));
  }, [columnsInfo.data, fromInput, timezone]);

  // ── What the table shows (applied on SHOW) ──
  const [applied, setApplied] = useState<QueryParams | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100);

  const from = zonedInputToMs(fromInput, timezone);
  const to = zonedInputToMs(toInput, timezone);
  const usable = (columnsInfo.data?.columns ?? []).filter((c) => resolution === 'minute' || !c.minuteOnly);
  const chosen = fields.filter((k) => usable.some((c) => c.key === k));
  const problem =
    from === null || to === null
      ? 'Enter a start and an end.'
      : to <= from
        ? 'The end must be after the start.'
        : chosen.length === 0
          ? 'Tick at least one column.'
          : null;

  const show = () => {
    if (problem || !deviceId || from === null || to === null) return;
    setApplied({ deviceId, from, to, fields: chosen, resolution });
    setPage(1);
  };

  const params = applied ? { ...applied, page, limit } : null;
  const result = useQuery({
    queryKey: queryKeys.queryRows(params ?? {}),
    queryFn: ({ signal }) => runQuery(params!, signal),
    enabled: Boolean(params),
    placeholderData: keepPreviousData,
  });

  const tableColumns = useMemo<ColumnDef<QueryRow, unknown>[]>(() => {
    const res = result.data;
    if (!res) return [];
    const time: ColumnDef<QueryRow, unknown> = {
      header: res.resolution === 'day' ? `Day (from ${String(res.rainDayStartHour).padStart(2, '0')}:00)` : `Time (${res.timezone})`,
      cell: ({ row }) =>
        res.resolution === 'day'
          ? formatDate(row.original.t, { mode: 'device', tz: res.timezone })
          : formatDateTime(row.original.t, { mode: 'device', tz: res.timezone }),
    };
    return [
      time,
      ...res.columns.map<ColumnDef<QueryRow, unknown>>((c) => ({
        header: c.unit ? `${c.label} (${c.unit})` : c.label,
        cell: ({ row }) => <span className="tabular-nums">{fmtValue(row.original[c.key])}</span>,
      })),
    ];
  }, [result.data]);

  if (station.isLoading) return <LoadingState label="Loading station…" />;
  if (!deviceId) return <EmptyState title="No weather station" body="There is no station to query yet." />;
  if (columnsInfo.isLoading) return <LoadingState label="Loading columns…" />;

  const toggle = (key: string, on: boolean) =>
    setFields((prev) => (on ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)));

  return (
    <div className="space-y-4">
      <Card className="space-y-5 p-4">
        {/* Period */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Period · station time ({timezone})</legend>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="q-from">From</Label>
              <Input id="q-from" type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-to">To</Label>
              <Input id="q-to" type="datetime-local" value={toInput} onChange={(e) => setToInput(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_RANGES.map((r) => (
                <Button
                  key={r.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = Date.now();
                    setFromInput(msToZonedInput(now - r.ms, timezone));
                    setToInput(msToZonedInput(now, timezone));
                  }}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
        </fieldset>

        {/* One row per… */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">One row for</legend>
          <div className="flex flex-wrap gap-4" role="radiogroup">
            {(['minute', 'hour', 'day'] as const).map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="q-resolution"
                  value={r}
                  checked={resolution === r}
                  onChange={() => setResolution(r)}
                  className="h-4 w-4"
                />
                {RESOLUTION_LABEL[r]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {resolution === 'minute'
              ? 'The stored one-minute records.'
              : `Built from the minutes: averages, the wind as a vector average, the highest gust, and rain as a total.${
                  resolution === 'day' ? ` A day starts at ${String(dayHour).padStart(2, '0')}:00 — the station’s rain day.` : ''
                }`}
          </p>
        </fieldset>

        {/* Columns */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Columns</legend>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {(columnsInfo.data?.columns ?? []).map((c) => {
              const disabled = c.minuteOnly && resolution !== 'minute';
              return (
                <label key={c.key} className={`flex items-start gap-2 text-sm ${disabled ? 'text-muted-foreground' : 'cursor-pointer'}`}>
                  <Checkbox checked={fields.includes(c.key) && !disabled} disabled={disabled} onCheckedChange={(on) => toggle(c.key, on)} />
                  <span>
                    {c.label}
                    {c.unit ? <span className="text-muted-foreground"> ({c.unit})</span> : null}
                    {disabled ? <span className="block text-xs">One-minute rows only</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={show} disabled={Boolean(problem)}>
            <Play className="h-4 w-4" /> Show
          </Button>
          {problem ? <p className="text-sm text-muted-foreground">{problem}</p> : null}
        </div>
      </Card>

      {applied ? (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-medium">
                {result.data ? `${result.data.total.toLocaleString()} ${result.data.total === 1 ? 'row' : 'rows'}` : 'Rows'} · {RESOLUTION_LABEL[applied.resolution].toLowerCase()}
              </h2>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(applied.from, { mode: 'device', tz: timezone })} – {formatDateTime(applied.to, { mode: 'device', tz: timezone })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                Rows per page
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[50, 100, 250, 500].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Can capability="exportData">
                {/* The whole query, every page — streamed by the server. */}
                <Button asChild variant="outline" size="sm">
                  <a href={queryCsvHref(applied)} download>
                    <Download className="h-4 w-4" /> Download CSV
                  </a>
                </Button>
              </Can>
            </div>
          </div>
          <DataTable
            data={result.data?.rows ?? []}
            columns={tableColumns}
            isLoading={result.isLoading}
            isStale={result.isPlaceholderData}
            error={result.isError}
            onRetry={() => result.refetch()}
            page={result.data?.page}
            pageCount={result.data?.pageCount}
            total={result.data?.total}
            onPageChange={setPage}
            getRowId={(r) => String(r.t)}
            emptyLabel="Nothing recorded in this period."
          />
        </Card>
      ) : null}
    </div>
  );
}
