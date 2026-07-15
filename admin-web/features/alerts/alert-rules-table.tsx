'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Bell, History, Pencil, Trash2 } from 'lucide-react';
import type { AlertRule } from '@/lib/api/types';
import { DataTable } from '@/components/data/data-table';
import { StatusBadge } from '@/components/charts/status-badge';
import { ConfirmDialog } from '@/components/data/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Can } from '@/lib/rbac/guard';
import { useRbac } from '@/lib/rbac/context';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { formatRelative } from '@/lib/time';
import { useDashboardDevices } from '@/features/dashboard/use-dashboard';
import { ruleSummary } from './alert-constants';
import { useUpdateAlertRule, useDeleteAlertRule } from './use-alerts';
import { AlertRuleDialog } from './alert-rule-dialog';
import { TriggerHistoryDrawer } from './trigger-history-drawer';

/** Toggle a rule's armed state inline (isActive). Isolated so its own mutation hook is scoped per rule. */
function ActiveToggle({ rule }: { rule: AlertRule }) {
  const { can } = useRbac();
  const update = useUpdateAlertRule(rule._id);
  const toast = useApiToast();
  return (
    <Switch
      checked={rule.isActive}
      disabled={!can('manageAlerts') || update.isPending}
      aria-label={rule.isActive ? 'Disarm rule' : 'Arm rule'}
      onClick={(e) => e.stopPropagation()}
      onCheckedChange={async (v) => {
        try {
          await update.mutateAsync({ isActive: v });
        } catch (e) {
          toast.error(e);
        }
      }}
    />
  );
}

export function AlertRulesTable({
  rows,
  page,
  pageCount,
  total,
  onPageChange,
  isLoading,
}: {
  rows: AlertRule[];
  page?: number;
  pageCount?: number;
  total?: number;
  onPageChange?: (p: number) => void;
  isLoading?: boolean;
}) {
  const { data: devices = [] } = useDashboardDevices();
  const deviceName = (id: string) => devices.find((d) => d._id === id)?.name ?? id.slice(-6);
  const del = useDeleteAlertRule();
  const toast = useApiToast();

  const [historyRule, setHistoryRule] = useState<AlertRule | null>(null);
  const [editRule, setEditRule] = useState<AlertRule | null>(null);
  const [deleteRule, setDeleteRule] = useState<AlertRule | null>(null);

  const columns = useMemo<ColumnDef<AlertRule, unknown>[]>(
    () => [
      {
        header: 'Rule',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">{deviceName(row.original.deviceId)}</span>
          </div>
        ),
      },
      {
        header: 'Condition',
        cell: ({ row }) => <span className="text-sm">{ruleSummary(row.original)}</span>,
      },
      {
        header: 'Cooldown',
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.cooldownMinutes} min</span>,
      },
      {
        header: 'Notify',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.notifyUserIds.length === 0 ? 'Org-wide' : `${row.original.notifyUserIds.length} user(s)`}
          </span>
        ),
      },
      {
        header: 'Last fired',
        cell: ({ row }) =>
          row.original.lastTriggeredAt ? (
            <span className="flex items-center gap-1 text-xs">
              <Bell className="h-3 w-3 text-status-warn" />
              {formatRelative(row.original.lastTriggeredAt)}
              <span className="text-muted-foreground">· {row.original.triggerHistory?.length ?? 0}×</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <ActiveToggle rule={row.original} />
            {row.original.isActive ? (
              <StatusBadge tone="ok" label="Armed" />
            ) : (
              <StatusBadge tone="offline" label="Paused" />
            )}
          </div>
        ),
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" aria-label="Trigger history" onClick={() => setHistoryRule(row.original)}>
              <History className="h-4 w-4" />
            </Button>
            <Can capability="manageAlerts">
              <Button variant="ghost" size="icon" aria-label="Edit rule" onClick={() => setEditRule(row.original)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Delete rule" onClick={() => setDeleteRule(row.original)}>
                <Trash2 className="h-4 w-4 text-status-error" />
              </Button>
            </Can>
          </div>
        ),
      },
    ],
    [devices],
  );

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        page={page}
        pageCount={pageCount}
        total={total}
        onPageChange={onPageChange}
        isLoading={isLoading}
        getRowId={(r) => r._id}
        onRowClick={(r) => setHistoryRule(r)}
        emptyLabel="No alert rules yet. Create one to get notified when a reading crosses a threshold."
      />

      {historyRule ? (
        <TriggerHistoryDrawer
          rule={historyRule}
          open={Boolean(historyRule)}
          onOpenChange={(o) => !o && setHistoryRule(null)}
        />
      ) : null}

      {editRule ? (
        <AlertRuleDialog rule={editRule} open={Boolean(editRule)} onOpenChange={(o) => !o && setEditRule(null)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteRule)}
        onOpenChange={(o) => !o && setDeleteRule(null)}
        title="Delete alert rule?"
        description={deleteRule ? `"${deleteRule.name}" will stop monitoring and its trigger history is removed.` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleteRule) return;
          try {
            await del.mutateAsync(deleteRule._id);
            toast.success('Alert rule deleted');
            setDeleteRule(null);
          } catch (e) {
            toast.error(e);
            throw e;
          }
        }}
      />
    </>
  );
}
