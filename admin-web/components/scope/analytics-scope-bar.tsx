'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import type { DeviceType } from '@/lib/api/types';
import { useScope, type RangePreset } from '@/lib/hooks/use-scope';
import { useDashboardDevices } from '@/features/dashboard/use-dashboard';
import { DeviceSelect } from '@/components/data/device-select';
import { DateRangePicker } from '@/components/data/date-range-picker';
import { Button } from '@/components/ui/button';

/** Analytics data spans ~30 days; the global 24h default is usually empty here. */
const ANALYTICS_DEFAULT_RANGE: RangePreset = '30d';

/**
 * AnalyticsScopeBar — the reduced filter row for the analytics tabs (plan §4-A).
 * Each analytics tab is locked to one device family, so unlike the global ScopeBar
 * this drops the device-type select and the "Include demo data" toggle (they'd be
 * noise) and pre-filters the device dropdown to that family:
 *   - Family from the path: `/analytics/nep*` → NEP-LINK, else MET-LINK.
 *   - Defaults the window to 30d when no `range` is set (§4-A4) — the global 24h
 *     default is empty because it's narrower than the data. Writes the param
 *     explicitly for every preset (incl. 24h) so the default never re-applies over
 *     a deliberate choice.
 *   - Clears a carried-over `deviceId` of the wrong family (§4-A5) so the tab never
 *     shows a device the page would silently ignore.
 */
export function AnalyticsScopeBar() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const type: DeviceType = pathname.startsWith('/analytics/nep') ? 'NEP-LINK' : 'MET-LINK';
  const { scope } = useScope();
  const { data: devices = [] } = useDashboardDevices();

  // Normalize the URL for this tab in a single replace (§4-A4 + §4-A5): seed the
  // 30d default when absent, and drop a wrong-family device carried in from
  // another page. Re-runs on tab switch (pathname → type) and once devices load.
  useEffect(() => {
    const sp = new URLSearchParams(params.toString());
    let changed = false;

    if (!sp.get('range')) {
      sp.set('range', ANALYTICS_DEFAULT_RANGE);
      changed = true;
    }

    const devId = sp.get('device');
    if (devId && devices.length) {
      const dev = devices.find((d) => d._id === devId);
      if (dev && dev.type !== type) {
        sp.delete('device');
        changed = true;
      }
    }

    if (changed) router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }, [params, devices, type, pathname, router]);

  /** Write scope params directly — persists `range` for EVERY preset (setScope
   *  strips 24h as the global default, which would let the 30d seed re-apply). */
  const patch = (next: { deviceId?: string | null; range?: RangePreset }) => {
    const sp = new URLSearchParams(params.toString());
    if ('deviceId' in next) {
      if (next.deviceId) sp.set('device', next.deviceId);
      else sp.delete('device');
    }
    if (next.range) sp.set('range', next.range);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const resetAnalytics = () => {
    const sp = new URLSearchParams(params.toString());
    ['device', 'type', 'demo'].forEach((k) => sp.delete(k));
    sp.set('range', ANALYTICS_DEFAULT_RANGE);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const showReset = Boolean(scope.deviceId) || scope.range !== ANALYTICS_DEFAULT_RANGE;
  const allLabel = type === 'MET-LINK' ? 'All MET-LINK devices' : 'All NEP-LINK devices';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card/40 px-3 py-2 text-sm">
      <DeviceSelect
        value={scope.deviceId}
        type={type}
        onChange={(deviceId) => patch({ deviceId: deviceId ?? null })}
        allLabel={allLabel}
        className="h-8 w-[220px]"
      />

      <DateRangePicker value={scope.range} onChange={(range) => patch({ range })} className="h-8 w-[150px]" />

      {showReset ? (
        <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 text-xs" onClick={resetAnalytics}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
      ) : null}
    </div>
  );
}
