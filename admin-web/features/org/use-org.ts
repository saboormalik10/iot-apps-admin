'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrganization, updateOrganization } from '@/lib/api/endpoints';
import type { Organization } from '@/lib/api/types';
import type { UpdateOrgInput } from '@/lib/api/schemas';
import { queryKeys } from '@/lib/query/keys';

export function useOrg() {
  return useQuery<Organization>({
    queryKey: queryKeys.org,
    queryFn: ({ signal }) => getOrganization(signal),
  });
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOrgInput) => updateOrganization(input),
    onSuccess: (org) => {
      qc.setQueryData(queryKeys.org, org);
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
