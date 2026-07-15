'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createShare, listShares, revokeShare, getPublicSnapshot } from '@/lib/api/endpoints';
import type { CreateShareInput } from '@/lib/api/schemas';
import { queryKeys } from '@/lib/query/keys';

/** Share-links module hooks (plan §Month 11). Writes are audited server-side. */

export function useShares(q: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.shares(q),
    queryFn: ({ signal }) => listShares(q, signal),
  });
}

export function useCreateShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShareInput) => createShare(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['share'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeShare(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['share'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

/**
 * The unauthenticated public snapshot (plan §Month 11 / §17 Q4). Static — no
 * realtime, no refetch churn (a share is a point-in-time snapshot). Retries are
 * off so an expired/revoked token fails fast to the "not found" state.
 */
export function usePublicSnapshot(token: string) {
  return useQuery({
    queryKey: ['public', token],
    queryFn: ({ signal }) => getPublicSnapshot(token, signal),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
