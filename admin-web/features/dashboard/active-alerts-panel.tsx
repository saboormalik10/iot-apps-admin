'use client';

import Link from 'next/link';
import { BellRing, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/charts/status-badge';
import { EmptyState } from '@/components/screen-states';
import { formatRelative } from '@/lib/time';
import { useNotifications } from '@/features/notifications/use-notifications';

/**
 * Active-alerts panel (plan §6) — recent `alert`-type notifications from the
 * Month-7 feed (the system tracks alert *activity*, not "firing now"). The bell
 * and `alert:triggered` keep the feed fresh; this surfaces the latest few here.
 */
export function ActiveAlertsPanel() {
  const { data } = useNotifications();
  const alerts = (data?.page.rows ?? []).filter((n) => n.type === 'alert').slice(0, 6);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <BellRing className="h-4 w-4" /> Recent alerts
        </h3>
        <Link href="/alerts" className="text-xs text-primary hover:underline">
          Alert rules
        </Link>
      </div>
      {alerts.length === 0 ? (
        <EmptyState title="No recent alerts" body="Threshold breaches will appear here." />
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={a._id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">{a.body}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {a.readAt ? null : <StatusBadge tone="warn" label="New" />}
                <span className="text-xs text-muted-foreground">{formatRelative(a.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
