'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { getDisplayUnits, updateDisplayUnits } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import type { DisplayUnits, DisplayUnitsInput } from '@/lib/api/types';
import {
  CANONICAL,
  convert,
  convertDelta,
  decimalsFor,
  familyOfCanonical,
  formatIn,
  type UnitFamily,
} from './convert';

/**
 * This organisation's display units.
 *
 * Long `staleTime` and a canonical `placeholderData`: nearly every reading on
 * every screen goes through this, so it must resolve to SOMETHING on first paint
 * rather than leave charts unlabelled while a request is in flight. The
 * placeholder is the canonical set — the units the API's numbers are already in
 * — so a pre-load render is correct rather than merely blank, and only a
 * customer who has actually chosen sees values move after the fetch lands.
 */
export function useDisplayUnits() {
  return useQuery({
    queryKey: queryKeys.displayUnits,
    queryFn: ({ signal }) => getDisplayUnits(signal),
    staleTime: 5 * 60_000,
    placeholderData: {
      ...CANONICAL,
      isCustomised: false,
      updatedAt: null,
    } satisfies DisplayUnits,
  });
}

export function useUpdateDisplayUnits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DisplayUnitsInput) => updateDisplayUnits(input),
    onSuccess: (units) => {
      // Seeded from the response, like branding: the server returns the resolved
      // set, so a refetch would only risk a flash of the previous units.
      qc.setQueryData(queryKeys.displayUnits, units);
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export interface UnitFormatters {
  /** The resolved preference, for a site that needs the raw strings. */
  units: DisplayUnits;
  /**
   * The unit LABEL to render for a canonical unit — `unitFor('m/s')` gives
   * `'knots'` when that is the preference. A unit outside the four families
   * (`'%'`, `'W/m²'`, `'V'`) comes back untouched, so a shared sensor list can
   * pass every unit through this without special-casing.
   */
  unitFor: (canonicalUnit: string) => string;
  /** Canonical number → preferred number. Null-preserving. */
  value: (v: number | null | undefined, canonicalUnit: string) => number | null;
  /** Canonical number → formatted string in the preferred unit. */
  format: (v: number | null | undefined, canonicalUnit: string, decimals?: number) => string;
  /** Sensible decimals for a canonical unit under the current preference. */
  decimals: (canonicalUnit: string, base?: number) => number;
  /** True when this family is being shown in something other than storage units. */
  isConverted: (canonicalUnit: string) => boolean;
  /**
   * A DIFFERENCE between two readings, converted without the offset, plus the
   * unit it is safe to label it with — see `convertDelta`. Use this for a change
   * or a rate ("+2.1 hPa / 3h"), never `format`, which would add °C→°F's +32.
   */
  delta: (v: number | null | undefined, canonicalUnit: string, decimals?: number) => { text: string; unit: string };
  /**
   * The same offset-free conversion as `delta`, as a NUMBER, for a chart series
   * that plots a difference (a spread, a change, a rate) alongside readings.
   */
  deltaValue: (v: number | null | undefined, canonicalUnit: string) => number | null;
}

/**
 * The hook render sites use.
 *
 * Every method is keyed by the CANONICAL unit string a site already hardcoded,
 * not by a sensor key or family name. That is what let this be wired into the
 * existing screens without restructuring them: `unit="hPa"` becomes
 * `unit={unitFor('hPa')}` and `fmt(v, 1)` becomes `format(v, 'hPa')`.
 */
export function useUnits(): UnitFormatters {
  const { data } = useDisplayUnits();
  // Memoised, not just defaulted: the fallback object would otherwise be a new
  // identity on every render, and `units` is a dependency of the formatters
  // below — and of the memos at the render sites that consume them. A fresh
  // object each render would quietly make all of that caching a no-op.
  //
  // The guard itself only fires if `placeholderData` is ever removed from
  // `useDisplayUnits`; it stays so a render site can never crash on a lookup.
  const units = useMemo<DisplayUnits>(
    () => data ?? { ...CANONICAL, isCustomised: false, updatedAt: null },
    [data],
  );

  const chosen = useCallback(
    (canonicalUnit: string): { family: UnitFamily; to: string } | null => {
      const family = familyOfCanonical(canonicalUnit);
      if (!family) return null;
      return { family, to: units[family] };
    },
    [units],
  );

  return useMemo<UnitFormatters>(
    () => ({
      units,
      unitFor: (u) => chosen(u)?.to ?? u,
      value: (v, u) => {
        const c = chosen(u);
        return c ? convert(v, c.family, c.to) : (v ?? null);
      },
      format: (v, u, decimals) => {
        const c = chosen(u);
        if (!c) return v == null ? '–' : v.toLocaleString(undefined, { maximumFractionDigits: decimals ?? 1 });
        return formatIn(v, c.family, c.to, decimals);
      },
      decimals: (u, base) => {
        const c = chosen(u);
        return c ? decimalsFor(c.family, c.to, base) : (base ?? 1);
      },
      isConverted: (u) => {
        const c = chosen(u);
        return Boolean(c && c.to !== CANONICAL[c.family]);
      },
      deltaValue: (v, u) => {
        const c = chosen(u);
        if (!c) return v ?? null;
        return convertDelta(v, c.family, c.to).value;
      },
      delta: (v, u, decimals) => {
        const c = chosen(u);
        if (!c) {
          return {
            text: v == null ? '–' : v.toLocaleString(undefined, { maximumFractionDigits: decimals ?? 1 }),
            unit: u,
          };
        }
        const { value: converted, unit } = convertDelta(v, c.family, c.to);
        const digits = decimals ?? decimalsFor(c.family, unit);
        return {
          text:
            converted == null
              ? '–'
              : converted.toLocaleString(undefined, {
                  minimumFractionDigits: digits,
                  maximumFractionDigits: digits,
                }),
          unit,
        };
      },
    }),
    [units, chosen],
  );
}
