'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import type { DeviceType } from '@/lib/api/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/charts/status-badge';
import { ConfirmDialog } from '@/components/data/confirm-dialog';
import { TableSkeleton, EmptyState } from '@/components/screen-states';
import { Can } from '@/lib/rbac/guard';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { firmwareTargetSchema } from '@/lib/api/schemas';
import { useFirmwareStatus, useSetFirmwareTarget } from './use-devices';

/**
 * Firmware-status table (plan §6) — flags devices on outdated firmware (status-
 * coloured), and lets an admin set the per-type firmware target. `targetSource`
 * distinguishes a configured target from the max-seen fallback.
 */
export function FirmwareStatusTable({ type }: { type?: DeviceType }) {
  const { data, isLoading } = useFirmwareStatus(type);
  const [targetOpen, setTargetOpen] = useState(false);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          Firmware status
          {data ? <span className="ml-2 text-xs text-muted-foreground">{data.outdated} outdated</span> : null}
        </h2>
        <Can capability="manageDevices">
          <Button variant="outline" size="sm" onClick={() => setTargetOpen(true)}>
            <Settings2 className="h-4 w-4" /> Set target
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} cols={4} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="No firmware data" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Device</th>
                <th className="px-2 py-2 font-medium">Current</th>
                <th className="px-2 py-2 font-medium">Target</th>
                <th className="py-2 pl-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.deviceId} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium">{r.name}</td>
                  <td className="px-2 py-2 tabular-nums">{r.firmwareVersion ?? '–'}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {r.target ?? '–'}
                    {r.target ? (
                      <span className="ml-1 text-xs text-muted-foreground">({r.targetSource})</span>
                    ) : null}
                  </td>
                  <td className="py-2 pl-2">
                    {r.outdated ? (
                      <StatusBadge tone="warn" label="Outdated" />
                    ) : (
                      <StatusBadge tone="ok" label="Up to date" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SetTargetDialog open={targetOpen} onOpenChange={setTargetOpen} defaultType={type ?? 'MET-LINK'} />
    </Card>
  );
}

function SetTargetDialog({
  open,
  onOpenChange,
  defaultType,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultType: DeviceType;
}) {
  const [deviceType, setDeviceType] = useState<DeviceType>(defaultType);
  const [version, setVersion] = useState('');
  const setTarget = useSetFirmwareTarget();
  const toast = useApiToast();

  const confirm = async () => {
    const parsed = firmwareTargetSchema.safeParse({ deviceType, version });
    if (!parsed.success) {
      toast.error(new Error(parsed.error.issues[0]?.message ?? 'Invalid version'));
      throw new Error('validation');
    }
    try {
      await setTarget.mutateAsync(parsed.data);
      toast.success('Firmware target set');
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Set firmware target"
      description="Devices reporting an older version than the target are flagged as outdated."
      confirmLabel="Set target"
      onConfirm={confirm}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Device type</Label>
          <Select value={deviceType} onValueChange={(v) => setDeviceType(v as DeviceType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MET-LINK">MET-LINK</SelectItem>
              <SelectItem value="NEP-LINK">NEP-LINK</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Target version</Label>
          <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.2.0" />
        </div>
      </div>
    </ConfirmDialog>
  );
}
