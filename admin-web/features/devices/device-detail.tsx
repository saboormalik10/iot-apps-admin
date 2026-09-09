'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Cpu, Waves, Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/charts/status-badge';
import { ConfirmDialog } from '@/components/data/confirm-dialog';
import { LoadingState, ErrorState } from '@/components/screen-states';
import { Can } from '@/lib/rbac/guard';
import { useApiToast } from '@/lib/hooks/use-api-toast';
import { formatRelative } from '@/lib/time';
import { useDeviceSubscription, useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent } from '@/lib/realtime/events';
import { queryKeys } from '@/lib/query/keys';
import { fmt } from '@/components/charts/chart-utils';
import { EditDeviceDialog } from './device-dialogs';
import { useDevice, useDeviceHealth, useDeleteDevice } from './use-devices';

/**
 * Device detail (plan §Month 8) — live status header + the health facts the
 * ingestion pipeline actually writes, with admin edit/soft-delete. Subscribes to
 * this device's room so status updates live.
 *
 * The "Settings" link is gone (M25): the device-settings editor it opened stored
 * eighteen preferences that no surface in this portal — and no shipped app — ever
 * read back. See the deleted `device-settings-form.tsx` in git history. The
 * GET/PATCH endpoints and the stored documents are untouched.
 *
 * Deliberately NOT shown here (M25): sessions, last activity, firmware version,
 * firmware age, firmware history and battery percentage. Every one of those is
 * written only by the mobile BLE heartbeat (`PATCH /sync/device-status`) or by
 * NepSession uploads. Nothing in the SFTP/CSV ingestion path touches them, so on
 * an ingest-fed station they rendered as a permanent wall of "–" — worse than
 * absent, because an empty tile reads as "no signal" rather than "not measured".
 * Battery voltage survives because it IS ingested, as `MetMeasure.batteryVoltageV`
 * — see `getDeviceHealth` in the backend, which now reads it from there.
 */
export function DeviceDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useApiToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: device, isLoading, isError, refetch } = useDevice(id);
  const health = useDeviceHealth(id);
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
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </Can>
        </div>
      </div>

      {/* Health summary — only the facts ingestion actually writes. */}
      {health.data ? (
        <Card className="grid grid-cols-2 gap-3 p-4 text-sm md:grid-cols-3">
          <HealthRow label="Last seen" value={health.data.lastSeenAt ? formatRelative(health.data.lastSeenAt) : '–'} />
          <HealthRow label="Sync lag" value={health.data.lastSyncLagSeconds != null ? `${health.data.lastSyncLagSeconds}s` : '–'} />
          {health.data.batteryVoltage != null ? (
            <HealthRow label="Battery voltage" value={`${fmt(health.data.batteryVoltage, 2)} V`} />
          ) : null}
        </Card>
      ) : null}

      {/* Conditional so the form reseeds from the CURRENT device each time it
          opens, rather than from whatever it held when the page first rendered. */}
      {editOpen ? <EditDeviceDialog device={device} open onOpenChange={setEditOpen} /> : null}
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
