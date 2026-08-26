'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listOrganizations } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { useRbac } from '@/lib/rbac/context';

/** Customers a platform administrator can switch into. */
export function useOrganizations() {
  const { isSuperAdmin } = useRbac();
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: ({ signal }) => listOrganizations(signal),
    // Nobody else may call this — it 403s — so it is not even attempted.
    enabled: isSuperAdmin,
    staleTime: 60_000,
  });
}

/**
 * Switch the acting organisation.
 *
 * `queryClient.clear()` is the important part, not a tidy-up: every cached query
 * was fetched under the PREVIOUS organisation's token. Invalidating would leave
 * that data on screen while refetches land, so one customer's devices would be
 * rendered under another customer's name — briefly, and wrongly.
 *
 * `router.refresh()` then re-runs the server components so the layout picks up
 * the new session user, since the shell reads it server-side.
 */
export function useSwitchOrganization() {
  const qc = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (organizationId: string | null) => {
      const res = await fetch('/api/auth/switch-org', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string } };
      if (!res.ok) throw new Error(body?.error?.message ?? 'Could not switch organisation');
      return body.data;
    },
    onSuccess: () => {
      qc.clear();
      router.refresh();
    },
  });
}
