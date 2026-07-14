'use client';

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  listSessions,
  getNepSession,
  getSessionSamples,
  getSessionTrail,
  listSessionFiles,
  updateSessionComment,
  deleteSessionFile,
  type SessionsQuery,
} from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';

/** Sessions list — Scope-Bar filtered (device + window + probe/search), paginated. */
export function useSessions(q: SessionsQuery) {
  return useQuery({
    queryKey: queryKeys.sessions(q),
    queryFn: ({ signal }) => listSessions(q, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: queryKeys.nepSession(id),
    queryFn: ({ signal }) => getNepSession(id, signal),
    enabled: Boolean(id),
  });
}

/** One page of a session's samples. `downsample` collapses long series to ≤500 pts for charts. */
export function useSessionSamples(id: string, opts: { page?: number; limit?: number; downsample?: boolean } = {}) {
  const { page = 1, limit = 500, downsample = false } = opts;
  return useQuery({
    queryKey: queryKeys.sessionSamples(id, page, limit, downsample),
    queryFn: ({ signal }) => getSessionSamples(id, { page, limit, downsample }, signal),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

export function useSessionTrail(id: string) {
  return useQuery({
    queryKey: queryKeys.sessionTrail(id),
    queryFn: ({ signal }) => getSessionTrail(id, signal),
    enabled: Boolean(id),
  });
}

export function useSessionFiles(id: string) {
  return useQuery({
    queryKey: queryKeys.sessionFiles(id),
    queryFn: ({ signal }) => listSessionFiles(id, signal),
    enabled: Boolean(id),
  });
}

/** Edit a session comment (operator/admin). Invalidates detail, list, and audit. */
export function useUpdateSessionComment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (comment: string) => updateSessionComment(id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.nepSession(id) });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useDeleteSessionFile(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => deleteSessionFile(id, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sessionFiles(id) }),
  });
}
