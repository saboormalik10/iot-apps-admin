'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/charts/status-badge';
import { EmptyState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { formatRelative, formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { AlertRule } from '@/lib/api/types';
import { ruleSummary } from './alert-constants';
import { useAlertRule } from './use-alerts';
import { RuleTimeline, TIMELINE_WINDOWS, windowLabel } from './rule-timeline';

/**
 * What a rule has done, and why.
 *
 * Two questions, deliberately in this order: the timeline answers "why is my
 * feed empty when the rule says armed?" minute by minute, and the log below it
 * lists the alerts that were actually raised. The log alone could never answer
 * the first question — a rule that never fires has an empty one.
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
  const [minutes, setMinutes] = useState<number>(15);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
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

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">What this rule saw</h3>
            {/* Window picker sits in one row above the chart it controls. */}
            <div role="group" aria-label="Timeline window" className="flex flex-wrap gap-1">
              {TIMELINE_WINDOWS.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={minutes === m ? 'default' : 'outline'}
                  aria-pressed={minutes === m}
                  className="h-7 px-2 text-xs"
                  onClick={() => setMinutes(m)}
                >
                  {windowLabel(m)}
                </Button>
              ))}
            </div>
          </div>
          <RuleTimeline ruleId={rule._id} minutes={minutes} enabled={open} />
        </section>

        <section className="space-y-2 pt-2">
          <h3 className="text-sm font-medium">Alert log</h3>
          {history.length === 0 ? (
            <EmptyState
              title="No alerts yet"
              body="This rule hasn't crossed its threshold since it was created."
              className="border-0 py-8"
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {history.map((h, i) => {
                // The log stores the reading in the SENSOR's unit; the rule is
                // written in the operator's. Printing one with the other's label
                // said "1.67 km/h" for a 1.67 m/s reading — a number and a unit
                // from two different systems, and it read as below a 3 km/h
                // threshold it had in fact crossed.
                // The server converts, so the client never carries a second
                // copy of the conversion table. Falls back to the raw reading
                // with no unit label rather than pairing a number with a unit
                // it is not in.
                const shown =
                  h.displayValue != null
                    ? `${h.displayValue}${h.displayUnit ? ` ${h.displayUnit}` : ''}`
                    : `${h.sensorValue}`;
                return (
                  <li
                    key={`${h.triggeredAt}-${i}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{shown}</span>
                      <span className={cn('text-xs text-muted-foreground')}>
                        {formatDateTime(h.measuredAtMs ?? h.triggeredAt)}
                        {h.measuredAtMs == null ? ' (processed)' : ''}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {h.notifiedCount === 0 ? 'org-wide' : `${h.notifiedCount} notified`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
