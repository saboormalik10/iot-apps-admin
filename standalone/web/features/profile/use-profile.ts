'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getProfile, updateProfile, type UpdateProfilePayload } from '@/lib/api/endpoints';
import type { Profile } from '@/lib/api/types';
import { queryKeys } from '@/lib/query/keys';

export function useProfile() {
  return useQuery<Profile>({
    queryKey: queryKeys.profile,
    queryFn: ({ signal }) => getProfile(signal),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfilePayload) => updateProfile(input),
    onSuccess: (profile) => qc.setQueryData(queryKeys.profile, profile),
  });
}
