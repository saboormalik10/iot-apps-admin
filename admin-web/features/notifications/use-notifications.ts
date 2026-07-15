'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listNotifications,
  listNotificationsPage,
  listPushTokens,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationsResult,
} from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';

const OPTS = { limit: 20 } as const;

export function useNotifications() {
  return useQuery<NotificationsResult>({
    queryKey: queryKeys.notifications(OPTS),
    queryFn: ({ signal }) => listNotifications(OPTS, signal),
    // The bell reflects near-real-time state; realtime events also invalidate it.
    staleTime: 15_000,
  });
}

/** The full feed page (plan §Month 11) — filterable (all/unread) + server-paginated. */
export function useNotificationsFeed(opts: { unread?: boolean; page?: number; limit?: number }) {
  return useQuery<NotificationsResult>({
    queryKey: queryKeys.notificationsFeed(opts),
    queryFn: ({ signal }) => listNotificationsPage(opts, signal),
    staleTime: 15_000,
  });
}

/** Admin push-token registry (plan §6). */
export function usePushTokens() {
  return useQuery({
    queryKey: queryKeys.pushTokens,
    queryFn: ({ signal }) => listPushTokens(signal),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
