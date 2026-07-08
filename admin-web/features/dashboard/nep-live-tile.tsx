'use client';

import { Waves, Thermometer, Battery } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatTile } from '@/components/charts/stat-tile';
import { StatusBadge } from '@/components/charts/status-badge';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { fmt } from '@/components/charts/chart-utils';
import { ntuClassIndex, NTU_CLASSES } from '@/lib/api/scales';
import { formatRelative } from '@/lib/time';
import { useNepLatest } from './use-dashboard';

/** Map an NTU value onto a status tone via its validated class (never backend hex). */
function turbidityTone(ntu: number | null): 'ok' | 'warn' | 'error' {
  if (ntu == null) return 'ok';
  const i = ntuClassIndex(ntu);
  if (i <= 1) return 'ok';
  if (i <= 3) return 'warn';
  return 'error';
}

/**
 * Live NEP session tile (plan §6) — the latest session summary + most-recent sample
 * readout, pushed via `nep:sample`. Shows the min/avg/max turbidity the session
 * carries (not just the average) and a water-quality class badge.
 */
export function NepLiveTile({ deviceId, isAuto }: { deviceId?: string; isAuto?: boolean }) {
  const { data, isLoading } = useNepLatest(deviceId);

  if (!deviceId) return <EmptyState title="No NEP-LINK device" body="Pair a NEP-LINK probe to see live turbidity." />;
  if (isLoading) return <LoadingState label="Loading live turbidity…" />;
  if (!data) return <EmptyState title="No NEP sessions" body="This device has not logged a session yet." />;

  const s = data.session;
  const latest = data.latestSample;
  const ntu = latest?.turbidityValue ?? s.turbidityAvg ?? null;
  const wq = ntu != null ? NTU_CLASSES[ntuClassIndex(ntu)] : null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Live turbidity · {s.deviceName}
          {isAuto ? <span className="ml-2 text-xs font-normal text-muted-foreground">(auto-selected)</span> : null}
        </h3>
        {wq ? <StatusBadge tone={turbidityTone(ntu)} label={wq.waterQualityClass} /> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Latest NTU" value={fmt(ntu, 1)} icon={<Waves className="h-4 w-4" />} sub={s.probeRange ?? undefined} />
        <StatTile label="Min / Max" value={`${fmt(s.turbidityMin, 0)} / ${fmt(s.turbidityMax, 0)}`} />
        <StatTile label="Temp" value={fmt(latest?.temperatureValue ?? s.temperatureAvg, 1)} icon={<Thermometer className="h-4 w-4" />} sub="°C" />
        <StatTile label="Battery" value={fmt(latest?.batteryLevel, 0)} icon={<Battery className="h-4 w-4" />} sub="%" />
      </div>
      <p className="text-xs text-muted-foreground">
        {s.sampleCount} samples · last {latest ? formatRelative(latest.timestamp) : '–'}
      </p>
    </Card>
  );
}
