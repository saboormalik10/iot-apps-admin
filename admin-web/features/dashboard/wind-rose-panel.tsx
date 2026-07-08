'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WindRose, type WindDatum } from '@/components/charts/wind-rose';
import { LoadingState, EmptyState } from '@/components/screen-states';
import { useMetWindrose } from './use-dashboard';

/**
 * Wind rose panel (plan §6) — the signature chart with a true/relative orientation
 * toggle and a 10-min / 2-min period selection (mirrors the device's windRoseOrient /
 * windRosePeriod). Refreshes live via the debounced `met:windrose` handler.
 */
export function WindRosePanel({ deviceId }: { deviceId?: string }) {
  const { data, isLoading } = useMetWindrose(deviceId);
  const [orient, setOrient] = useState<'true' | 'relative'>('true');
  const [period, setPeriod] = useState<'10m' | '2m'>('10m');

  const samples: WindDatum[] = useMemo(() => {
    if (!data) return [];
    const raw = period === '10m' ? data.last600 : data.last120;
    return raw.map((s) => ({ speedMs: s.speedMs, dirDeg: orient === 'true' ? s.dirTrueDeg : s.dirRelDeg }));
  }, [data, period, orient]);

  if (!deviceId) return null;
  if (isLoading) return <Card className="p-4"><LoadingState label="Loading wind rose…" /></Card>;
  if (!data) return <Card className="p-4"><EmptyState title="No wind data" /></Card>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Toggle active={orient === 'true'} onClick={() => setOrient('true')}>True</Toggle>
        <Toggle active={orient === 'relative'} onClick={() => setOrient('relative')}>Relative</Toggle>
        <span className="mx-1 w-px bg-border" />
        <Toggle active={period === '10m'} onClick={() => setPeriod('10m')}>10 min</Toggle>
        <Toggle active={period === '2m'} onClick={() => setPeriod('2m')}>2 min</Toggle>
      </div>
      <WindRose samples={samples} title={`Wind rose · ${orient} · ${period === '10m' ? '10 min' : '2 min'}`} />
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant={active ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={onClick} aria-pressed={active}>
      {children}
    </Button>
  );
}
