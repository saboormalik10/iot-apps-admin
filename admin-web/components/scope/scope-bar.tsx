'use client';

import { usePathname } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import type { DeviceType } from '@/lib/api/types';
import { useScope } from '@/lib/hooks/use-scope';
import { useDashboardDevices } from '@/features/dashboard/use-dashboard';
import { DeviceSelect } from '@/components/data/device-select';
import { DateRangePicker } from '@/components/data/date-range-picker';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL_TYPES = '__all_types__';

/**
 * Routes that are not "data pages" — the Scope Bar hides itself here (plan §3.6).
 * `/import` belongs on this list: the wizard picks its own target device, and a
 * scope row above it would imply the import honours the device/date filter.
 * `/analytics` renders its own reduced, type-scoped bar (AnalyticsScopeBar) —
 * no device-type select (each tab is locked to one family) — so the global bar
 * steps aside there. That bar carries its own demo toggle.
 */
const HIDDEN_PREFIXES = [
  '/org',
  '/settings',
  '/profile',
  '/import',
  '/analytics',
  '/roles',
  '/platform',
  '/stream-types',
  // Below: pages that render no scoped data. The bar was still drawn on these,
  // so its three controls wrote to the URL and nothing read them — a filter row
  // that visibly does nothing reads as a broken filter, not an absent one.
  //
  // `/alerts` and `/notifications` are here because they carry their OWN
  // filters; two filter rows disagreeing about what is shown is worse than one.
  '/fleet',
  '/alerts',
  '/notifications',
  '/share',
  '/users',
];

/**
 * Detail routes — `/records/<id>`, `/devices/<id>`.
 *
 * The LIST at each of these paths is scoped and keeps its bar; the detail page
 * is already pinned to one record or one device, so a device filter above it
 * would be asking to narrow to something other than the thing on screen.
 */
const DETAIL_ROUTE = /^\/(records|devices)\/[^/]+/;

/**
 * Routes where the DEVICE and TYPE filters work but the RANGE reads nothing.
 *
 * Stations lists current state — status, last seen, battery, firmware — none of
 * which is bounded by a time window, so a range control there changes the URL
 * and nothing else. The rest of the bar stays, because it does filter.
 */
const NO_RANGE_PREFIXES = ['/devices'];

/**
 * ScopeBar — the persistent, URL-synced filter row inherited by every data page
 * (plan §3.6). Defaults to All / whole fleet and narrows on demand: device,
 * device type, date range, and real-vs-demo mode. One-click reset to All.
 * Units stay in the app-shell toggle (global), so they are not duplicated here.
 */
export function ScopeBar() {
  const pathname = usePathname();
  const { scope, setScope, reset, isDefault } = useScope();
  // Type options come from the backend device list — only families the org
  // actually owns are offered (no hardcoded frontend filter values).
  const { data: devices = [] } = useDashboardDevices();
  const availableTypes = Array.from(new Set(devices.map((d) => d.type)));

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)) || DETAIL_ROUTE.test(pathname)) return null;

  const showRange = !NO_RANGE_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card/40 px-4 py-2 text-sm md:px-6">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Scope</span>

      <Select
        value={scope.deviceType ?? ALL_TYPES}
        onValueChange={(v) =>
          setScope({ deviceType: v === ALL_TYPES ? undefined : (v as DeviceType), deviceId: undefined })
        }
      >
        <SelectTrigger className="h-8 w-[130px]" aria-label="Device type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TYPES}>All types</SelectItem>
          {availableTypes.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DeviceSelect
        value={scope.deviceId}
        type={scope.deviceType}
        onChange={(deviceId) => setScope({ deviceId })}
        className="h-8 w-[190px]"
      />

      {showRange ? (
        <DateRangePicker value={scope.range} onChange={(range) => setScope({ range })} className="h-8 w-[150px]" />
      ) : null}

      {!isDefault ? (
        <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 text-xs" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to All
        </Button>
      ) : null}
    </div>
  );
}
