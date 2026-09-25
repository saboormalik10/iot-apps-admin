'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listAudit, type AuditQuery } from '@/lib/api/endpoints';
import type { Page } from '@/lib/api/pagination';
import type { AuditEntry } from '@/lib/api/types';
import { queryKeys } from '@/lib/query/keys';

export function useAudit(query: AuditQuery) {
  return useQuery<Page<AuditEntry>>({
    queryKey: queryKeys.audit(query),
    queryFn: ({ signal }) => listAudit(query, signal),
    placeholderData: keepPreviousData, // smooth pagination / filtering
  });
}
