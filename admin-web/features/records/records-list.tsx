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
const duration = (r: MetRecordRow) =>
  r.dateEndMs != null ? `${Math.max(1, Math.round((r.dateEndMs - r.dateStartMs) / 60000))} min` : '—';

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
      { header: 'Duration', cell: ({ row }) => duration(row.original) },
      { header: 'Measures', cell: ({ row }) => row.original.measureCount.toLocaleString() },
    ],
    [],
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
