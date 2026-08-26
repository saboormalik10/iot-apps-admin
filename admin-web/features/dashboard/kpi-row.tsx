'use client';

import { Cpu, Wifi, WifiOff, FileText, Waves } from 'lucide-react'; // BellRing ← armed-alerts tile disabled
import { StatTile } from '@/components/charts/stat-tile';

import { fmt } from '@/components/charts/chart-utils';
import { useSummary } from './use-dashboard';
import { useEffectiveDeviceType } from './use-scoped-device';

/**
 * KPI stat-tile row (plan §6, Month 8) — headline numbers with per-tile sparklines
 * and the active-alert-rules tile, both powered by the §10.8 summary enrichment.
 * Records/sessions tiles show the last-14-day trend; the alerts tile deep-links to /alerts.
 * The scope's type/device filter narrows every count server-side and hides the
 * other family's tiles (a MET scope drops NEP sessions + the MET/NEP split).
 */
export function KpiRow() {
  const { data, isLoading, isError } = useSummary();
  const effectiveType = useEffectiveDeviceType();
  const showMet = !effectiveType || effectiveType === 'MET-LINK';
  const showNep = !effectiveType || effectiveType === 'NEP-LINK';

  if (isLoading) return <KpiSkeleton />;
  if (isError || !data) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatTile label="Devices" value={fmt(data.totalDevices, 0)} icon={<Cpu className="h-4 w-4" />} />
      <StatTile
        label="Online"
        value={fmt(data.onlineDevices, 0)}
        sub={`${fmt(data.offlineDevices, 0)} offline`}
        icon={data.onlineDevices > 0 ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      />
      {showMet ? (
        <StatTile
          label="MET records"
          value={fmt(data.totalMetRecords, 0)}
          icon={<FileText className="h-4 w-4" />}
          spark={data.sparklines?.records}
          sparkRole="chart-2"
        />
      ) : null}
      {showNep ? (
        <StatTile
          label="NEP sessions"
          value={fmt(data.totalNepSessions, 0)}
          icon={<Waves className="h-4 w-4" />}
          spark={data.sparklines?.sessions}
          sparkRole="chart-1"
        />
      ) : null}
      {/* Armed-alerts tile removed with the alerts section. The backend still
          returns `activeAlertRules` (a count of previously configured rules),
          but nothing evaluates them, so the number would be misleading.
      <StatTile
        label="Armed alerts"
        value={fmt(data.activeAlertRules, 0)}
        sub="View alert rules"
        icon={<BellRing className="h-4 w-4" />}
        href="/alerts"
      /> */}
      {!effectiveType ? (
        <StatTile label="MET / NEP" value={`${fmt(data.metLinkDevices, 0)} / ${fmt(data.nepLinkDevices, 0)}`} />
      ) : null}
    </div>
  );
}

/**
 * Loading state for the KPI row (M24 W2).
 *
 * It used to render `<TableSkeleton rows={1} cols={6} />`, which is 32px tall
 * against a loaded row of 98px — so the entire dashboard below it dropped 66px
 * the moment the summary landed. Measured as one of four separate contributors to
 * the dashboard's CLS; the LIGHTHOUSE.md write-up had blamed only the live panels.
 *
 * Rather than reserve a guessed height, this renders the SAME `StatTile` in the
 * SAME grid, and fills each slot with `text-transparent` text of realistic
 * length. The line boxes are therefore the real ones — label, value at
 * `text-2xl`, and a `sub` line — so the height matches by construction and keeps
 * matching if a tile's typography changes.
 */
function KpiSkeleton() {
  const Bar = ({ children }: { children: string }) => (
    <span className="animate-pulse rounded bg-muted text-transparent">{children}</span>
  );

  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading summary…
      </span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatTile key={i} label="—" value={<Bar>0,000</Bar>} sub={<Bar>0 offline</Bar>} />
        ))}
      </div>
    </div>
  );
}
