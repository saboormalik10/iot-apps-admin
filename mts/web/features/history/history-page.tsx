'use client';

import { useState } from 'react';
import { Download, Play } from 'lucide-react';
import type { HistoryRow, LocationId, ParameterId, QueryInterval } from '@/lib/api/types';
import { PARAMETER_LABELS, runHistoryQuery } from '@/lib/api/endpoints';
import { EmptyState, LoadingState, TableSkeleton } from '@/components/screen-states';
import { StatusPill, readingTone } from '@/components/status/status-pill';
import { Button } from '@/components/ui/button';
import { useDemoClock } from '@/lib/demo-clock';
import { fmtDateTime, fmtValue } from '@/lib/format';
import { STATIONS } from '@/lib/mock/seed/stations';
import { cn } from '@/lib/utils';
import { RainHeatmaps } from './rain-heatmaps';
import { QueryTrends } from './query-trends';

/**
 * The query engine — point and click, no SQL.
 *
 * The proposal is explicit that an operator with no technical background must be
 * able to get exactly the rows they want and take them away as a CSV. So the
 * controls are the four questions they actually have — which places, which
 * readings, over what period, averaged how — and the export delivers the filtered
 * set rather than everything.
 */

const PARAMETERS: ParameterId[] = [
  'rainfall',
  'water_level',
  'float_switch',
  'temperature',
  'humidity',
  'wind_mean',
  'wind_gust',
  'battery',
];

const INTERVALS: { id: QueryInterval; label: string }[] = [
  { id: 'raw', label: 'Raw (1 minute)' },
  { id: '10min', label: '10-minute' },
  { id: '1h', label: '1 hour' },
  { id: '1d', label: '1 day' },
];

type SortKey = 't' | 'location' | 'parameter' | 'value';

const COLUMNS: { label: string; key?: SortKey }[] = [
  { label: 'Timestamp', key: 't' },
  { label: 'Location', key: 'location' },
  { label: 'Parameter', key: 'parameter' },
  { label: 'Value', key: 'value' },
  { label: 'Unit' },
  { label: 'Status' },
  { label: 'Logger / ID' },
];

function exportRows(rows: HistoryRow[]) {
  if (!rows.length) return;
  const csv = [
    '# SYNTHETIC DEMO DATA — Sydney Metro M1 design prototype — not measurements',
    ['Timestamp', 'Location', 'Parameter', 'Value', 'Unit', 'Status', 'Logger'].join(','),
    ...rows.map((r) =>
      [new Date(r.t).toISOString(), r.locationName, r.parameterLabel, r.value ?? '', r.unit, r.status, r.sensorId]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mts-history-demo.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function HistoryPage() {
  const now = useDemoClock();
  const [locations, setLocations] = useState<LocationId[]>(['marrickville', 'belmore']);
  const [parameters, setParameters] = useState<ParameterId[]>(['rainfall', 'water_level']);
  const [interval, setInterval] = useState<QueryInterval>('10min');
  const [days, setDays] = useState(7);
  /* A preset covers "the last week"; an incident review needs the two hours on a
     particular afternoon, which a preset cannot express. */
  const [useDates, setUseDates] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 't', dir: 'desc' });
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [running, setRunning] = useState(false);
  /* What the last run asked for — the trend charts draw that, not the form as it is being edited. */
  const [ran, setRan] = useState<{ locations: LocationId[]; parameters: ParameterId[]; from: number; to: number } | null>(null);

  if (!now) return <LoadingState label="Loading…" />;

  const dateRange = () => {
    if (!useDates || !fromDate || !toDate) return { from: now - days * 86_400_000, to: now };
    const from = new Date(`${fromDate}T00:00:00`).getTime();
    const to = new Date(`${toDate}T23:59:59`).getTime();
    return { from: Math.min(from, to), to: Math.max(from, to) };
  };

  const run = async (toPage = 1) => {
    setRunning(true);
    const { from, to } = dateRange();
    const res = await runHistoryQuery({
      locationIds: locations,
      parameters,
      from,
      to,
      interval,
      page: toPage,
      pageSize,
    });
    setRows(res.items);
    setRan({ locations, parameters, from, to });
    setTotal(res.total);
    setPage(res.page);
    setRunning(false);
  };

  const toggle = <T,>(list: T[], value: T, set: (v: T[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* Sorting is applied to the page on screen. In the real build this is an
     `order by` on the query; here it keeps the interaction honest without
     pretending the prototype holds four thousand rows in memory. */
  const sorted = [...(rows ?? [])].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    switch (sort.key) {
      case 't':
        return (a.t - b.t) * dir;
      case 'location':
        return a.locationName.localeCompare(b.locationName) * dir;
      case 'parameter':
        return a.parameterLabel.localeCompare(b.parameterLabel) * dir;
      case 'value':
        return ((a.value ?? 0) - (b.value ?? 0)) * dir;
      default:
        return 0;
    }
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Historical data — query engine</h1>
        <p className="text-sm text-muted-foreground">
          All readings are retained. Choose locations, parameters and a period; view them here or export the exact
          set as CSV.
        </p>
      </div>

      <RainHeatmaps minuteKey={Math.floor(now / 60_000)} />

      <h2 className="pt-2 text-base font-semibold">Query</h2>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Location(s)</legend>
            <div className="flex flex-wrap gap-1.5">
              {STATIONS.map((s) => (
                <Chip
                  key={s.id}
                  active={locations.includes(s.id)}
                  onClick={() => {
                    toggle(locations, s.id, setLocations);
                    setRows(null);
                  }}
                >
                  {s.name}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Sensor / parameter</legend>
            <div className="flex flex-wrap gap-1.5">
              {PARAMETERS.map((p) => (
                <Chip
                  key={p}
                  active={parameters.includes(p)}
                  onClick={() => {
                    toggle(parameters, p, setParameters);
                    setRows(null);
                  }}
                >
                  {PARAMETER_LABELS[p]}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Period</span>
            <select
              value={useDates ? 'custom' : String(days)}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  const end = new Date(now);
                  const start = new Date(now - 6 * 86_400_000);
                  setFromDate(start.toISOString().slice(0, 10));
                  setToDate(end.toISOString().slice(0, 10));
                  setUseDates(true);
                } else {
                  setUseDates(false);
                  setDays(Number(e.target.value));
                }
              }}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Between two dates…</option>
            </select>
          </label>
          {useDates ? (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">From</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                />
              </label>
            </>
          ) : null}
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Interval</span>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value as QueryInterval)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {INTERVALS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => run(1)} disabled={running || !locations.length || !parameters.length}>
            <Play className="h-4 w-4" /> {running ? 'Running…' : 'Run query'}
          </Button>
          <Button variant="outline" disabled={!rows?.length} onClick={() => exportRows(sorted)}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          {!locations.length || !parameters.length ? (
            <p className="text-xs text-muted-foreground">Choose at least one location and one parameter.</p>
          ) : null}
        </div>
      </section>

      {ran ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Trend of the queried set</h2>
          <QueryTrends {...ran} />
        </section>
      ) : null}

      {rows === null ? (
        <EmptyState title="No query has been run yet" body="Choose what you want and select Run query." />
      ) : (
        <section className="rounded-lg border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-sm font-semibold">
              Query results — {total.toLocaleString('en-AU')} records · showing{' '}
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} · newest first
            </h2>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Rows per page
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setTimeout(() => run(1), 0);
                }}
                className="h-7 rounded border bg-background px-1"
              >
                {[25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </header>

          {running ? (
            <div className="p-4">
              <TableSkeleton rows={8} cols={7} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No rows in that period" body="Widen the period, or pick another parameter." />
          ) : (
            <div className="scroll-x-hint overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-header text-header-foreground">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.label}
                        aria-sort={
                          c.key ? (sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined
                        }
                        className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium"
                      >
                        {c.key ? (
                          <button
                            onClick={() =>
                              setSort((cur) =>
                                cur.key === c.key
                                  ? { key: cur.key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
                                  : { key: c.key!, dir: 'asc' },
                              )
                            }
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            {c.label}
                            <span aria-hidden className={cn('text-[9px]', sort.key !== c.key && 'opacity-30')}>
                              {sort.key === c.key && sort.dir === 'asc' ? '▲' : '▼'}
                            </span>
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={`${r.t}-${r.sensorId}-${i}`} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="tabular whitespace-nowrap px-3 py-1.5 text-muted-foreground">{fmtDateTime(r.t)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{r.locationName}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">{r.parameterLabel}</td>
                      <td className={cn('tabular whitespace-nowrap px-3 py-1.5 font-medium', r.status === 'alert' && 'text-sev-alert-strong')}>
                        {r.parameter === 'float_switch' ? (r.value === 1 ? 'WET' : 'DRY') : fmtValue(r.value, 1)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{r.unit}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <StatusPill tone={readingTone(r.status)} size="sm" />
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-1.5 text-muted-foreground">{r.sensorId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            <span>The export delivers the exact filtered result set as a UTF-8 CSV file.</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => run(page - 1)}>
                Previous
              </Button>
              <span className="tabular px-2">
                {page} / {pageCount}
              </span>
              <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => run(page + 1)}>
                Next
              </Button>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        active ? 'border-primary bg-primary/10 font-medium text-primary-strong' : 'bg-card text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
