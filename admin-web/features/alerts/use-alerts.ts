'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listAlertRules,
  getAlertRule,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  type AlertRulesQuery,
} from '@/lib/api/endpoints';
import type { AlertRuleInput, UpdateAlertRuleInput } from '@/lib/api/schemas';
import { queryKeys } from '@/lib/query/keys';

/** Alert-rules module hooks (plan §Month 11). Writes invalidate the list + audit. */

export function useAlertRules(q: AlertRulesQuery) {
  return useQuery({
    queryKey: queryKeys.alertRules(q),
    queryFn: ({ signal }) => listAlertRules(q, signal),
  });
}

export function useAlertRule(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.alertRule(id),
    queryFn: ({ signal }) => getAlertRule(id, signal),
    enabled: enabled && Boolean(id),
  });
}

function invalidateAlerts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['alert-rules'] });
  // The Home KPI tile counts armed (isActive) rules via /dashboard/summary (§10.8).
  qc.invalidateQueries({ queryKey: queryKeys.summary });
  qc.invalidateQueries({ queryKey: ['audit'] });
}

export function useCreateAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AlertRuleInput) => createAlertRule(input),
    onSuccess: () => invalidateAlerts(qc),
  });
}

export function useUpdateAlertRule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAlertRuleInput) => updateAlertRule(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.alertRule(id) });
      invalidateAlerts(qc);
    },
  });
}

export function useDeleteAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAlertRule(id),
    onSuccess: () => invalidateAlerts(qc),
  });
}

/**
 * Bulk-create — fan one rule spec across several devices (plan §6 "Bulk-create
 * helper fans one rule across several devices"). Runs the creates in parallel and
 * reports how many succeeded so a partial failure is surfaced, not swallowed.
 */
export function useBulkCreateAlertRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (specs: AlertRuleInput[]) => {
      const results = await Promise.allSettled(specs.map((s) => createAlertRule(s)));
      const created = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - created;
      return { created, failed };
    },
    onSuccess: () => invalidateAlerts(qc),
  });
}
