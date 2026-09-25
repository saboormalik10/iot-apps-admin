'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Cpu, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/charts/status-badge';
import { LoadingState, ErrorState } from '@/components/screen-states';
import { Can } from '@/lib/rbac/guard';
import { formatRelative } from '@/lib/time';
import { useDeviceSubscription, useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent } from '@/lib/realtime/events';
import { queryKeys } from '@/lib/query/keys';
import { fmt } from '@/components/charts/chart-utils';
import { EditDeviceDialog } from './device-dialogs';
import { useDevice, useDeviceHealth } from './use-devices';

/**
 * Station detail (plan §Month 8) — live status header, the health facts the
 * stream actually writes, and an admin edit. Subscribes to this station's room
 * so status updates live.
 *
 * NO DELETE. A site install has one station, and deleting it deletes every
 * reading it ever recorded — the client keeps the data indefinitely (22 Sep
 * 2026). The backend route is gone too.
 */
export function DeviceDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const { data: device, isLoading, isError, refetch } = useDevice(id);
  const health = useDeviceHealth(id);

  // Live: subscribe to this device's room and refetch on status changes.
  useDeviceSubscription(id);
  useSocketEvent(ClientEvent.DEVICE_STATUS, () => {
    qc.invalidateQueries({ queryKey: queryKeys.device(id) });
    qc.invalidateQueries({ queryKey: queryKeys.deviceHealth(id) });
  });

  if (isLoading) return <LoadingState label="Loading device…" />;
  if (isError || !device) return <ErrorState title="Device not found" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Cpu className="h-6 w-6" />
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
