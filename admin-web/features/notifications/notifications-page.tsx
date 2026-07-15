'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-states';
import { Can } from '@/lib/rbac/guard';
import { formatRelative } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/api/types';
import { useNotificationsFeed, useMarkAllRead, useMarkRead } from './use-notifications';
import { notificationMeta, notificationLink } from './notification-meta';
import { PushTokenTable } from './push-token-table';

/**
 * Notifications feed page (plan §Month 11) — the full inbox with an all/unread
 * filter, mark-read (per item on click + mark-all), deep-links, and (admin) the
 * push-token registry. The feed is a rolling 90-day window (server TTL), surfaced
 * so it never implies infinite history.
 */
export function NotificationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const markAll = useMarkAllRead();
  const markRead = useMarkRead();

  const { data, isLoading, isError, refetch } = useNotificationsFeed({
    unread: tab === 'unread',
    page,
    limit: 25,
  });
  const rows = data?.page.rows ?? [];
  const pageCount = data?.page.pageCount ?? 1;
  const unread = data?.unreadCount ?? 0;

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n._id);
    router.push(notificationLink(n));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-xs text-muted-foreground">Rolling 90-day history · {unread} unread</p>
        </div>
        {unread > 0 ? (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        ) : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as 'all' | 'unread');
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread{unread > 0 ? ` (${unread})` : ''}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isError ? (
        <ErrorState title="Couldn't load notifications" onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState
          title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          body="Alerts, completed sessions and firmware changes will appear here."
        />
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {rows.map((n) => {
              const meta = notificationMeta(n.type);
              const Icon = meta.icon;
              return (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent',
                      !n.readAt && 'bg-accent/40',
                    )}
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', `text-status-${meta.tone}`)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{n.title}</span>
                        <Badge variant={meta.tone} className="shrink-0 text-[10px]">
                          {meta.label}
                        </Badge>
                        {!n.readAt ? <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-status-info" aria-label="Unread" /> : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {page} of {pageCount}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Can capability="manageOrg">
        <section className="space-y-3 pt-2">
          <div>
            <h2 className="text-lg font-medium">Registered devices</h2>
            <p className="text-xs text-muted-foreground">
              Mobile devices registered for push. Delivery is over WebSocket today; these tokens are ready for when
              native push is enabled.
            </p>
          </div>
          <PushTokenTable />
        </section>
      </Can>
    </div>
  );
}
