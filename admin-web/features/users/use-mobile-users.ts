'use client';

import { useQuery } from '@tanstack/react-query';
import { listMobileUsers } from '@/lib/api/endpoints';
import type { MobileUser } from '@/lib/api/types';
import { queryKeys } from '@/lib/query/keys';

export function useMobileUsers() {
  return useQuery<MobileUser[]>({
    queryKey: queryKeys.mobileUsers,
    queryFn: ({ signal }) => listMobileUsers(signal),
  });
}
