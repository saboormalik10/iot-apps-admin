'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/screen-states';
import { useNotifications, useMarkAllRead, useMarkRead } from './use-notifications';
import { notificationMeta, notificationLink } from './notification-meta';
import { invalidateForNotification } from './notification-effects';
import { useSocketEvent, useOnReconnect } from '@/lib/realtime/hooks';
import { ClientEvent, type NotificationPayload, type AlertTriggeredPayload } from '@/lib/realtime/events';
import { toast } from '@/lib/hooks/use-toast';
import { formatRelative } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/api/types';

/**
 * The live notification bell (PR5, finalized in Month 11). The badge reads
 * `unreadCount` from GET /notifications; `notification:new` + `alert:triggered`
 * bump it in real time, and — per the "refetch is truth" rule (§3.2) — a new
 * notification also invalidates the queries whose state actually changed (session
 * complete → sessions; firmware → firmware/fleet/device). Clicking a row marks it
 * read and deep-links to the relevant screen; reconnect refetches.
 */
export function NotificationBell() {
  const t = useTranslations('shell');
  const tn = useTranslations('notifications');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useNotifications();
  const markAll = useMarkAllRead();
  const markRead = useMarkRead();

  const invalidateFeed = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  // Live: any new notification refetches the feed AND the effect-bearing queries
  // (session_complete / firmware have no dedicated event — they arrive only here).
  useSocketEvent<NotificationPayload>(ClientEvent.NOTIFICATION, (payload) => {
    invalidateFeed();
    invalidateForNotification(qc, payload);
  });

  // Alerts also raise a status-coloured toast + reconcile the alert-rules list.
  useSocketEvent<AlertTriggeredPayload>(ClientEvent.ALERT_TRIGGERED, (p) => {
    const description =
      p?.sensor != null
        ? `${p.sensor} = ${p.sensorValue ?? '?'} (threshold ${p.threshold ?? '?'})`
        : tn('alertTriggered', { name: 'rule' });
    toast({ variant: 'error', title: tn('newAlert'), description });
    invalidateFeed();
    qc.invalidateQueries({ queryKey: ['alert-rules'] });
  });

  // Reconnect after a drop → refetch (we may have missed events while offline).
  useOnReconnect(invalidateFeed);

  const unread = data?.unreadCount ?? 0;
  const rows = data?.page.rows ?? [];

  const openNotification = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n._id);
    setOpen(false);
    router.push(notificationLink(n));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('notifications')} className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-error px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1">
        <div className="flex items-center justify-between border-b px-2 pb-2">
          <span className="text-sm font-semibold">{t('notifications')}</span>
          {unread > 0 ? (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => markAll.mutate()}>
              {t('markAllRead')}
            </Button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {rows.length === 0 ? (
            <EmptyState title={t('noNotifications')} body="" className="border-0 py-8" />
          ) : (
            rows.map((n) => {
              const meta = notificationMeta(n.type);
              const Icon = meta.icon;
              return (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => openNotification(n)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent',
                    !n.readAt && 'bg-accent/40',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon className={cn('h-3.5 w-3.5', `text-status-${meta.tone}`)} aria-hidden />
                      {n.title}
                    </span>
                    {!n.readAt ? <Badge variant="info" className="shrink-0" /> : null}
                  </div>
                  <span className="text-xs text-muted-foreground">{n.body}</span>
                  <span className="text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs"
            onClick={() => {
              setOpen(false);
              router.push('/notifications');
            }}
          >
            {t('notifications')} →
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
