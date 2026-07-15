'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent, type AlertTriggeredPayload } from '@/lib/realtime/events';
import { queryKeys } from '@/lib/query/keys';

/**
 * Live reconciliation for the alerts page (plan §Month 11 "rule history reconcile").
 * On `alert:triggered` we refetch the rule list AND the specific rule so its
 * trigger history + lastTriggeredAt update without a manual reload ("refetch is
 * truth"). No toast here — the global notification bell already raises one, so the
 * page must not double-toast. Reconnect / tab-return catch-up is centralized in
 * <RealtimeCatchup> (it refetches the ['alert-rules'] root).
 */
export function useAlertsRealtime() {
  const qc = useQueryClient();

  useSocketEvent<AlertTriggeredPayload>(ClientEvent.ALERT_TRIGGERED, (p) => {
    qc.invalidateQueries({ queryKey: ['alert-rules'] });
    if (p?.ruleId) qc.invalidateQueries({ queryKey: queryKeys.alertRule(p.ruleId) });
  });
}
