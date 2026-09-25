'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DeviceType } from '@/lib/api/types';
import { RANGE_PRESETS, rangeWindow, type RangePreset } from '@/lib/time/range-window';

/**
 * Global scope state (plan §3.6) — the app-wide filter shared by every data page.
 * Defaults to the whole org / entire fleet ("All"); narrows to a device, device
 * type, or date range on demand. State lives in the URL so it is shareable,
 * bookmarkable, and preserved across navigation.
 *
 */
/**
 * Range presets live in `lib/time/range-window.ts` — pure, React-free, and
 * therefore testable in a subprocess under a different `TZ`, which is how the
 * calendar presets are proven to follow the viewer. Re-exported here so the
 * existing importers keep working.
 */
export {
  RANGE_PRESETS,
  rangeWindow,
  localMidnight,
  type RangePreset,
  type RangeKind,
  type RangePresetDef,
} from '@/lib/time/range-window';

export interface Scope {
  deviceId?: string;
  deviceType?: DeviceType;
  range: RangePreset;
}

const DEFAULT_RANGE: RangePreset = '24h';

export function useScope() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const scope = useMemo<Scope>(() => {
    const range = (params.get('range') as RangePreset) || DEFAULT_RANGE;
    const validRange = RANGE_PRESETS.some((p) => p.key === range) ? range : DEFAULT_RANGE;
    const type = params.get('type');
    return {
      deviceId: params.get('device') || undefined,
      deviceType: type === 'MET-LINK' || type === 'NEP-LINK' ? type : undefined,
      range: validRange,
    };
  }, [params]);

  const write = useCallback(
    (next: Partial<Scope>) => {
      const merged = { ...scope, ...next };
      const sp = new URLSearchParams(params.toString());
      const set = (k: string, v: string | undefined | null) => (v ? sp.set(k, v) : sp.delete(k));
      set('device', merged.deviceId);
      set('type', merged.deviceType);
      set('range', merged.range === DEFAULT_RANGE ? undefined : merged.range);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [scope, params, pathname, router],
  );

  const reset = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    ['device', 'type', 'range', 'demo'].forEach((k) => sp.delete(k));
    router.replace(sp.toString() ? `${pathname}?${sp.toString()}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const isDefault = !scope.deviceId && !scope.deviceType && scope.range === DEFAULT_RANGE;

  // The window MUST be stable across renders: it feeds query keys (metHistory and
  // every Month-9 analytics chart). Computing `Date.now()` inline on each render
  // churns `from`/`to` every render → the query key changes → infinite refetch
  // loop. Quantize `now` to the current minute (MET data is 1-min bucketed anyway)
  // and memoize, so the window is reference-stable within a minute and advances at
  // most once per minute — i.e. one legitimate refetch when the minute rolls over.
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const window = useMemo(
    () => rangeWindow(scope.range, minuteBucket * 60_000),
    [scope.range, minuteBucket],
  );

  return { scope, setScope: write, reset, isDefault, window };
}
