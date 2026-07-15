'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent, useOnReconnect } from '@/lib/realtime/hooks';
import { ClientEvent, type AlertTriggeredPayload } from '@/lib/realtime/events';
import { queryKeys } from '@/lib/query/keys';

/**
 * Live reconciliation for the alerts page (plan §Month 11 "rule history reconcile").
 * On `alert:triggered` we refetch the rule list AND the specific rule so its
 * trigger history + lastTriggeredAt update without a manual reload ("refetch is
 * truth"). No toast here — the global notification bell already raises one, so the
 * page must not double-toast. A reconnect refetches in case we missed events.
 */
export function useAlertsRealtime() {
  const qc = useQueryClient();

  const reconcile = (ruleId?: string) => {
    qc.invalidateQueries({ queryKey: ['alert-rules'] });
    if (ruleId) qc.invalidateQueries({ queryKey: queryKeys.alertRule(ruleId) });
  };

  useSocketEvent<AlertTriggeredPayload>(ClientEvent.ALERT_TRIGGERED, (p) => reconcile(p?.ruleId));
  useOnReconnect(() => reconcile());
}
