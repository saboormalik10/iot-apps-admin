'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Waves } from 'lucide-react';
import type { NepSessionRow } from '@/lib/api/types';
import { useScope } from '@/lib/hooks/use-scope';
import { DataTable } from '@/components/data/data-table';
import { ExportMenu } from '@/components/data/export-menu';
import { sessionsZipHref } from '@/lib/api/endpoints';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NTU_CLASSES, ntuClassIndex, cssVar } from '@/lib/api/scales';
import { fmt } from '@/components/charts/chart-utils';
import { useSessions } from './use-sessions';

const fmtStart = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const duration = (s: NepSessionRow) =>
  s.endTimestamp != null ? `${Math.max(1, Math.round((s.endTimestamp - s.startTimestamp) / 60000))} min` : '—';

const PROBE_OPTIONS = ['all', 'R1', 'R2', 'R3'] as const;

/**
 * NEP sessions list (plan §Month 10) — scoped by the global Scope Bar (device +
 * date range) plus a probe-range filter and a device/comment search. Rows open the
 * rich session detail. Turbidity averages carry a WHO/EPA class swatch (§10.9).
 */
export function SessionsList() {
  const router = useRouter();
  const { scope, window } = useScope();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [probeRange, setProbeRange] = useState<(typeof PROBE_OPTIONS)[number]>('all');

  const { data, isLoading } = useSessions({
    deviceId: scope.deviceId,
    from: window.from,
    to: window.to,
    probeRange: probeRange === 'all' ? undefined : probeRange,
    search: search.trim() || undefined,
    page,
    limit: 20,
    // Demo mode is part of the query, so it is part of the react-query key too —
    // without it the toggle would serve the other mode's cached page.
  });

  const columns = useMemo<ColumnDef<NepSessionRow, unknown>[]>(
    () => [
      {
        header: 'Session',
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            <Waves className="h-4 w-4 text-muted-foreground" />
            {row.original.deviceName}
          </span>
        ),
      },
      { header: 'Started', cell: ({ row }) => fmtStart(row.original.startTimestamp) },
      { header: 'Duration', cell: ({ row }) => duration(row.original) },
      { header: 'Samples', cell: ({ row }) => row.original.sampleCount.toLocaleString() },
      {
        header: 'Avg NTU',
        cell: ({ row }) => {
          const avg = row.original.turbidityAvg;
          if (avg == null) return <span className="text-muted-foreground">—</span>;
          const role = NTU_CLASSES[ntuClassIndex(avg)].role;
          return (
            <span className="flex items-center gap-2 tabular-nums">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: cssVar(role) }} />
              {fmt(avg, 1)}
            </span>
          );
        },
      },
      {
        header: 'Probe',
        cell: ({ row }) => (row.original.probeRange ? <span className="text-xs tabular-nums">{row.original.probeRange}</span> : '—'),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search device or comment…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-9 max-w-xs"
        />
        <Select
          value={probeRange}
          onValueChange={(v) => {
            setProbeRange(v as (typeof PROBE_OPTIONS)[number]);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[140px]" aria-label="Probe range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROBE_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {p === 'all' ? 'All probe ranges' : `Probe ${p}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <ExportMenu
            options={[
              {
                key: 'sessions-zip',
                label: 'All sessions (ZIP)',
                icon: 'zip',
                href: scope.deviceId
                  ? sessionsZipHref({ deviceId: scope.deviceId, from: window.from, to: window.to })
                  : '',
                hint: 'One CSV per session, plus a manifest of photo URLs.',
                // The backend requires a deviceId — there is no fleet-wide export
                // (§17: default-device + comparison instead of fleet aggregate).
                disabled: !scope.deviceId,
                disabledReason: 'Pick a single device in the scope bar first.',
              },
            ]}
          />
        </div>
      </div>

      <DataTable
        data={data?.rows ?? []}
        columns={columns}
        isLoading={isLoading}
        page={data?.page}
        pageCount={data?.pageCount}
        total={data?.total}
        onPageChange={setPage}
        onRowClick={(r) => router.push(`/sessions/${r.id}`)}
        getRowId={(r) => r.id}
        emptyLabel="No sessions in this scope. Widen the date range, clear filters, or pick another device."
      />
    </div>
  );
}
