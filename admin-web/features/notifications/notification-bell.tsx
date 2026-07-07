'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/screen-states';
import { useNotifications, useMarkAllRead } from './use-notifications';
import { useSocketEvent, useOnReconnect } from '@/lib/realtime/hooks';
import { ClientEvent, type NotificationPayload } from '@/lib/realtime/events';
import { toast } from '@/lib/hooks/use-toast';
import { formatRelative } from '@/lib/time';

/**
 * The first LIVE feature (PR5). The badge reads `unreadCount` from GET
 * /notifications; `notification:new` + `alert:triggered` bump it in real time, and
 * a reconnect refetches (truth-is-server). Alert events also raise a status toast.
 */
export function NotificationBell() {
  const t = useTranslations('shell');
  const tn = useTranslations('notifications');
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useNotifications();
  const markAll = useMarkAllRead();

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  // Live: any new notification refetches the feed (covers session_complete /
  // firmware which have no dedicated event — the "refetch is truth" rule).
  useSocketEvent<NotificationPayload>(ClientEvent.NOTIFICATION, () => invalidate());

  // Alerts also raise a status-coloured toast.
  useSocketEvent<{ ruleId?: string }>(ClientEvent.ALERT_TRIGGERED, () => {
    toast({ variant: 'error', title: tn('newAlert'), description: tn('alertTriggered', { name: 'rule' }) });
    invalidate();
  });

  // Reconnect after a drop → refetch (we may have missed events while offline).
  useOnReconnect(invalidate);

  const unread = data?.unreadCount ?? 0;
  const rows = data?.page.rows ?? [];

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
      <PopoverContent>
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
            rows.map((n) => (
              <div key={n._id} className="flex flex-col gap-0.5 rounded-md px-2 py-2 hover:bg-accent">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{n.title}</span>
                  {!n.readAt ? <Badge variant="info" className="shrink-0" /> : null}
                </div>
                <span className="text-xs text-muted-foreground">{n.body}</span>
                <span className="text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
