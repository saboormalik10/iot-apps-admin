'use client';

import { usePathname } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import type { DeviceType } from '@/lib/api/types';
import { useScope } from '@/lib/hooks/use-scope';
import { DeviceSelect } from '@/components/data/device-select';
import { DateRangePicker } from '@/components/data/date-range-picker';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL_TYPES = '__all_types__';

/** Routes that are not "data pages" — the Scope Bar hides itself here (plan §3.6). */
const HIDDEN_PREFIXES = ['/org', '/settings', '/profile'];

/**
 * ScopeBar — the persistent, URL-synced filter row inherited by every data page
 * (plan §3.6). Defaults to All / whole fleet and narrows on demand: device,
 * device type, date range, and demo-data inclusion. One-click reset to All.
 * Units stay in the app-shell toggle (global), so they are not duplicated here.
 */
export function ScopeBar() {
  const pathname = usePathname();
  const { scope, setScope, reset, isDefault } = useScope();

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

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
          <SelectItem value="MET-LINK">MET-LINK</SelectItem>
          <SelectItem value="NEP-LINK">NEP-LINK</SelectItem>
        </SelectContent>
      </Select>

      <DeviceSelect
        value={scope.deviceId}
        type={scope.deviceType}
        onChange={(deviceId) => setScope({ deviceId })}
        className="h-8 w-[190px]"
      />

      <DateRangePicker value={scope.range} onChange={(range) => setScope({ range })} className="h-8 w-[150px]" />

      <div className="flex items-center gap-2 pl-1">
        <Switch
          id="scope-demo"
          checked={scope.includeDemo}
          onCheckedChange={(v) => setScope({ includeDemo: v })}
        />
        <Label htmlFor="scope-demo" className="text-xs text-muted-foreground">
          Include demo data
        </Label>
      </div>

      {!isDefault ? (
        <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 text-xs" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to All
        </Button>
      ) : null}
    </div>
  );
}
