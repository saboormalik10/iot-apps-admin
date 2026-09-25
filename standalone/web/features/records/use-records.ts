'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listRecords, getRecord, getRecordMeasures, getRecordSeries, type RecordsQuery } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';

/** Records list — Scope-Bar filtered (device + window), server-paginated. */
export function useRecords(q: RecordsQuery) {
  return useQuery({
    queryKey: queryKeys.records(q),
    queryFn: ({ signal }) => listRecords(q, signal),
    placeholderData: keepPreviousData,
  });
}

export function useRecord(id: string) {
  return useQuery({
    queryKey: queryKeys.record(id),
    queryFn: ({ signal }) => getRecord(id, signal),
    enabled: Boolean(id),
  });
}

/** One page of a record's measures (server-paginated — no client virtualization). */
/** Bucketed chart series for one record. Disabled until a column is picked. */
export function useRecordSeries(id: string, fields: string[], window?: { from?: number; to?: number }) {
  return useQuery({
    queryKey: queryKeys.recordSeries(id, fields, window?.from, window?.to),
    queryFn: ({ signal }) => getRecordSeries(id, fields, window, 500, signal),
    enabled: Boolean(id) && fields.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useRecordMeasures(
  id: string,
  page: number,
  limit: number,
  window?: { from?: number; to?: number },
) {
  return useQuery({
    queryKey: queryKeys.recordMeasures(id, page, limit, window?.from, window?.to),
    queryFn: ({ signal }) => getRecordMeasures(id, page, limit, window, signal),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}
