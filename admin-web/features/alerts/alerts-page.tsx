'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Can } from '@/lib/rbac/guard';
import { DeviceSelect } from '@/components/data/device-select';
import { ErrorState } from '@/components/screen-states';
import { useAlertRules } from './use-alerts';
import { useAlertsRealtime } from './use-alerts-realtime';
import { AlertRulesTable } from './alert-rules-table';
import { AlertRuleDialog } from './alert-rule-dialog';

const ALL_STATUS = '__all__';

/**
 * Alerts page (plan §Month 11) — the alert-rules CRUD table + rule builder +
 * trigger-history drawer. Filters by device and armed/paused status. Lives on the
 * global feed of live `alert:triggered` events, which reconcile the list.
 */
export function AlertsPage() {
  useAlertsRealtime();

  const [page, setPage] = useState(1);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string>(ALL_STATUS);
  const [createOpen, setCreateOpen] = useState(false);

  const isActive = status === ALL_STATUS ? undefined : status === 'active';
  const { data, isLoading, isError, refetch } = useAlertRules({ deviceId, isActive, page, limit: 20 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <Can capability="manageAlerts">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New rule
          </Button>
        </Can>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DeviceSelect
          value={deviceId}
          onChange={(id) => {
            setDeviceId(id);
            setPage(1);
          }}
          allLabel="All devices"
          className="h-9 w-[200px]"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[150px]" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUS}>All statuses</SelectItem>
            <SelectItem value="active">Armed</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState title="Couldn't load alert rules" onRetry={() => refetch()} />
      ) : (
        <AlertRulesTable
          rows={data?.rows ?? []}
          page={data?.page}
          pageCount={data?.pageCount}
          total={data?.total}
          onPageChange={setPage}
          isLoading={isLoading}
        />
      )}

      <AlertRuleDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
