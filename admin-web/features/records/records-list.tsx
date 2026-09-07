'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';
import type { MetRecordRow } from '@/lib/api/types';
import { useScope } from '@/lib/hooks/use-scope';
import { DataTable } from '@/components/data/data-table';
import { useRecords } from './use-records';

const fmt = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60000)).toLocaleString()} min`;

/** How long the record itself ran. `null` while the day is still open. */
const recordSpanMs = (r: MetRecordRow) => (r.dateEndMs != null ? r.dateEndMs - r.dateStartMs : null);

/**
 * How much of the record falls INSIDE the selected window.
 *
 * A record is one document per station per local day, so any range shorter than
 * a day still returns the whole record — and the row then reported the whole
 * day. Picking "last hour" showed `153 min`, which read as the filter being
 * ignored when in fact only the number beside it was wrong.
 */
const overlapMs = (r: MetRecordRow, window: { from?: number; to: number }): number | null => {
  const end = r.dateEndMs;
  if (end == null) return null;
  const start = Math.max(r.dateStartMs, window.from ?? Number.NEGATIVE_INFINITY);
  return Math.max(0, Math.min(end, window.to) - start);
};

/**
 * MET records list (plan §Month 9) — logging records filtered by the global Scope
 * Bar (device + date range). Rows open the rich record detail.
 */
export function RecordsList() {
  const router = useRouter();
  const { scope, window } = useScope();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useRecords({
    deviceId: scope.deviceId,
    from: window.from,
    to: window.to,
    page,
    limit: 20,
    // Demo mode is part of the query, so it is part of the react-query key too —
    // without it the toggle would serve the other mode's cached page.
  });

  const columns = useMemo<ColumnDef<MetRecordRow, unknown>[]>(
    () => [
      {
        header: 'Record',
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {row.original.deviceName}
          </span>
        ),
      },
      { header: 'Started', cell: ({ row }) => fmt(row.original.dateStartMs) },
      {
        header: 'Duration',
        cell: ({ row }) => {
          const full = recordSpanMs(row.original);
          if (full == null) return '—';
          const inWindow = overlapMs(row.original, window);
          // Qualify only when the window actually cuts the record — a fully
          // contained day would otherwise read "1440 min of 1440 min".
          if (inWindow == null || Math.round(inWindow / 60000) === Math.round(full / 60000)) {
            return minutes(full);
          }
          return (
            <span className="flex flex-col leading-tight">
              <span className="tabular-nums">{minutes(inWindow)}</span>
              <span className="text-xs text-muted-foreground">of {minutes(full)} that day</span>
            </span>
          );
        },
      },
      {
        header: 'Measures',
        cell: ({ row }) => {
          const { measureCount, measuresInRange } = row.original;
          // Only qualify the number when the window actually cuts the record.
          // A record fully inside the range would otherwise read "8,636 of
          // 8,636", which is noise.
          if (measuresInRange == null || measuresInRange === measureCount) {
            return measureCount.toLocaleString();
          }
          return (
            <span className="flex flex-col leading-tight">
              <span className="tabular-nums">{measuresInRange.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">of {measureCount.toLocaleString()} that day</span>
            </span>
          );
        },
      },
    ],
    // `window` is read by the Duration cell, so the columns must be rebuilt when
    // the range changes — otherwise the table keeps clipping to the old window.
    [window],
  );

  return (
    <DataTable
      data={data?.rows ?? []}
      columns={columns}
      isLoading={isLoading}
      page={data?.page}
      pageCount={data?.pageCount}
      total={data?.total}
      onPageChange={setPage}
      onRowClick={(r) => router.push(`/records/${r._id}`)}
      getRowId={(r) => r._id}
      emptyLabel="No records in this scope. Widen the date range or pick another device."
    />
  );
}
