'use client';

import Link from 'next/link';
import { CalendarRange, Map as MapIcon } from 'lucide-react';
import { useScope } from '@/lib/hooks/use-scope';
import { useScopedDevice } from '@/features/dashboard/use-scoped-device';
import { useSessions } from '@/features/sessions/use-sessions';
import { EmptyState } from '@/components/screen-states';
import { Button } from '@/components/ui/button';
import { useNepAnalyticsRealtime } from './use-nep-analytics-realtime';
import { TurbidityDistribution } from './charts/turbidity-distribution';
import { WaterQualityBadge } from './charts/water-quality-badge';
import { ProbeRangeBreakdown } from './charts/probe-range-breakdown';
import { CorrelationScatter } from './charts/correlation-scatter';
import { CrossSessionTrend } from './charts/cross-session-trend';
import { SessionComparison } from './charts/session-comparison';

/**
 * NEP Analytics Suite (plan §Month 10). Device-scoped like MET analytics: when the
 * Scope Bar is on All we auto-select a default NEP-LINK device. All panels fetch
 * once and refetch on socket events via useNepAnalyticsRealtime — no polling.
 */
export function NepAnalyticsPage() {
  const nep = useScopedDevice('NEP-LINK');
  const { window } = useScope();
  useNepAnalyticsRealtime();

  // The most-recent session in scope backs the water-quality badge.
  const { data: latest } = useSessions({ deviceId: nep.deviceId, from: window.from, to: window.to, limit: 1 });
  const latestSessionId = latest?.rows[0]?.id;

  if (!nep.deviceId || !nep.device) {
    return (
      <EmptyState
        title="No NEP-LINK device"
        body="The NEP analytics suite needs a NEP-LINK device. Pair one from the mobile app, or pick one from the device filter above."
      />
    );
  }
  const deviceId = nep.deviceId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {nep.isAuto ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{nep.device.name}</span> (auto-selected). Use the device
            filter above to choose a device.
          </p>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs">
            <Link href="/map">
              <MapIcon className="h-3.5 w-3.5" />
              GPS density
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs">
            <Link href="/analytics/nep/daily-summary">
              <CalendarRange className="h-3.5 w-3.5" />
              Daily summary
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <WaterQualityBadge sessionId={latestSessionId} />
        <div className="xl:col-span-2">
          <TurbidityDistribution deviceId={deviceId} />
        </div>
      </div>

      <CrossSessionTrend deviceId={deviceId} />

      <div className="grid gap-4 xl:grid-cols-2">
        <ProbeRangeBreakdown deviceId={deviceId} />
        <CorrelationScatter deviceId={deviceId} />
      </div>

      <SessionComparison deviceId={deviceId} />
    </div>
  );
}
