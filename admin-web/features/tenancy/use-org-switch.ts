'use client';

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
 * WHY A FULL NAVIGATION AND NOT `router.refresh()`
 * `router.refresh()` re-runs the server components but PRESERVES every client
 * component instance, and three of them belong to the previous customer:
 *
 *   • the Socket.IO connection, still joined to `roomForOrg(previousOrgId)`, so
 *     the admin keeps receiving the previous customer's device:status events;
 *   • `?device=` / `?type=` in the URL, which then query the new organisation
 *     with the old organisation's device id — empty results, blank picker;
 *   • the pathname, so an open `/records/<id>` names a record the new
 *     organisation cannot read.
 *
 * A page load resolves all three at once: the socket is torn down and
 * reconnects with a fresh ticket minted from the NEW token, and `/` carries no
 * scope params. Switching customers happens a handful of times a day, so one
 * second of reload is the right trade for making the switch total.
 */
export function useSwitchOrganization() {
  const qc = useQueryClient();

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
      // Kept even though the reload discards the cache anyway: it keeps the
      // no-stale-data guarantee local to this mutation, so it still holds if the
      // navigation below is ever softened back to a client-side transition.
      qc.clear();
      window.location.assign('/');
    },
  });
}
