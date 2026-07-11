'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listRecords, getRecord, getRecordMeasures, type RecordsQuery } from '@/lib/api/endpoints';
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
export function useRecordMeasures(id: string, page: number, limit: number) {
  return useQuery({
    queryKey: queryKeys.recordMeasures(id, page, limit),
    queryFn: ({ signal }) => getRecordMeasures(id, page, limit, signal),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}
