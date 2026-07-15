'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/charts/status-badge';
import { EmptyState } from '@/components/screen-states';
import { formatRelative, formatDateTime } from '@/lib/time';
import type { AlertRule } from '@/lib/api/types';
import { ruleSummary } from './alert-constants';
import { useAlertRule } from './use-alerts';

/**
 * Trigger-history drawer (plan §6) — shows a rule's rolling trigger log
 * (triggeredAt, sensorValue, notifiedCount) + lastTriggeredAt. It refetches the
 * rule while open so a live `alert:triggered` reconciles the list (not just badges).
 */
export function TriggerHistoryDrawer({
  rule: seed,
  open,
  onOpenChange,
}: {
  rule: AlertRule;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  // Re-read the rule when the drawer is open so history stays current.
  const { data } = useAlertRule(seed._id, open);
  const rule = data ?? seed;
  const history = [...(rule.triggerHistory ?? [])].reverse(); // newest first

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {rule.name}
            {rule.isActive ? <StatusBadge tone="ok" label="Active" /> : <StatusBadge tone="offline" label="Paused" />}
          </DialogTitle>
          <DialogDescription>
            {ruleSummary(rule)} · cooldown {rule.cooldownMinutes} min ·{' '}
            {rule.lastTriggeredAt ? `last fired ${formatRelative(rule.lastTriggeredAt)}` : 'never fired'}
          </DialogDescription>
        </DialogHeader>

        {history.length === 0 ? (
          <EmptyState title="No triggers yet" body="This rule hasn't crossed its threshold since it was created." className="border-0 py-10" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {history.map((h, i) => (
              <li key={`${h.triggeredAt}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">{h.sensorValue}{rule.unit ? ` ${rule.unit}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(h.triggeredAt)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {h.notifiedCount === 0 ? 'org-wide' : `${h.notifiedCount} notified`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
