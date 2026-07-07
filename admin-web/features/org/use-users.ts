'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inviteUser, listUsers, updateUser } from '@/lib/api/endpoints';
import type { Page } from '@/lib/api/pagination';
import type { OrgUser } from '@/lib/api/types';
import type { InviteUserInput, UpdateUserInput } from '@/lib/api/schemas';
import { queryKeys } from '@/lib/query/keys';

export function useUsers() {
  return useQuery<Page<OrgUser>>({
    queryKey: queryKeys.users,
    queryFn: ({ signal }) => listUsers(signal),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteUserInput) => inviteUser(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => updateUser(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
