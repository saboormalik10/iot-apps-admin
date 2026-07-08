'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Cpu, Waves, Pencil, Trash2, Settings, History } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/charts/stat-tile';
import { StatusBadge } from '@/components/charts/status-badge';
import { Meter } from '@/components/charts/meter';
import { ConfirmDialog } from '@/components/data/confirm-dialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/screen-states';
import { Can } from '@/lib/rbac/guard';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { formatRelative, formatDateTime } from '@/lib/time';
import { useDeviceSubscription, useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent } from '@/lib/realtime/events';
import { queryKeys } from '@/lib/query/keys';
import { fmt } from '@/components/charts/chart-utils';
import { EditDeviceDialog } from './device-dialogs';
import {
  useDevice,
  useDeviceStats,
  useDeviceHealth,
  useFirmwareHistory,
  useDeleteDevice,
} from './use-devices';

/**
 * Device detail (plan §Month 8) — live status header + stats/health tiles +
 * firmware-history timeline, with admin edit/soft-delete and a link to the full
 * settings editor. Subscribes to this device's room so status updates live.
 */
export function DeviceDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useApiToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: device, isLoading, isError, refetch } = useDevice(id);
  const stats = useDeviceStats(id);
  const health = useDeviceHealth(id);
  const firmware = useFirmwareHistory(id);
  const del = useDeleteDevice();

  // Live: subscribe to this device's room and refetch on status changes.
  useDeviceSubscription(id);
  useSocketEvent(ClientEvent.DEVICE_STATUS, () => {
    qc.invalidateQueries({ queryKey: queryKeys.device(id) });
    qc.invalidateQueries({ queryKey: queryKeys.deviceHealth(id) });
  });

  if (isLoading) return <LoadingState label="Loading device…" />;
  if (isError || !device) return <ErrorState title="Device not found" onRetry={() => refetch()} />;

  const confirmDelete = async () => {
    try {
      await del.mutateAsync(id);
      toast.success('Device deleted');
      router.push('/devices');
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {device.type === 'MET-LINK' ? <Cpu className="h-6 w-6" /> : <Waves className="h-6 w-6" />}
          <div>
            <h1 className="text-2xl font-semibold">{device.customName ?? device.name}</h1>
            <p className="text-sm text-muted-foreground">{device.type} · {device.bleId}</p>
          </div>
          {device.isOnline ? <StatusBadge tone="ok" label="Online" /> : <StatusBadge tone="offline" label="Offline" />}
        </div>
        <div className="flex gap-2">
          <Can capability="manageDevices">
            <Button asChild variant="outline" size="sm">
              <Link href={`/devices/${id}/settings`}>
                <Settings className="h-4 w-4" /> Settings
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </Can>
        </div>
      </div>

      {/* Stat + health tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Sessions" value={fmt(stats.data?.sessionCount, 0)} />
        <StatTile
          label="Last activity"
          value={stats.data?.lastActivityAt ? formatRelative(stats.data.lastActivityAt) : '–'}
        />
        <StatTile label="Firmware" value={device.firmwareVersion ?? '–'} />
        <Card className="flex flex-col justify-center gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Battery</span>
          <Meter value={health.data?.batteryPct ?? device.lastBatteryPct} />
        </Card>
      </div>

      {/* Health summary */}
      {health.data ? (
        <Card className="grid grid-cols-2 gap-3 p-4 text-sm md:grid-cols-4">
          <HealthRow label="Last seen" value={health.data.lastSeenAt ? formatRelative(health.data.lastSeenAt) : '–'} />
          <HealthRow label="Sync lag" value={health.data.lastSyncLagSeconds != null ? `${health.data.lastSyncLagSeconds}s` : '–'} />
          <HealthRow label="Battery voltage" value={fmt(health.data.batteryVoltage, 2) + ' V'} />
          <HealthRow label="Firmware age" value={health.data.firmwareAgeDays != null ? `${health.data.firmwareAgeDays} d` : '–'} />
        </Card>
      ) : null}

      {/* Firmware history timeline */}
      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4" /> Firmware history
        </h2>
        {!firmware.data || firmware.data.history.length === 0 ? (
          <EmptyState title="No firmware history" body="Version changes are recorded here as they are detected." />
        ) : (
          <ol className="relative space-y-4 border-l pl-4">
            {firmware.data.history.map((h) => (
              <li key={h._id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                <p className="text-sm font-medium tabular-nums">{h.version}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(h.detectedAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <EditDeviceDialog device={device} open={editOpen} onOpenChange={setEditOpen} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete device?"
        description="This soft-deletes the device and hides it from the fleet. Its historical data is retained."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular-nums">{value}</p>
    </div>
  );
}
