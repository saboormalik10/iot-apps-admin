import type { LocationId } from '@/lib/api/types';
import { rainfallMmHr } from './profiles';

/**
 * Rolling rainfall totals — the rule engine's actual inputs (§7.2).
 *
 * One convention, used everywhere: a tally at time `u` is the rain that fell in
 * the half-open window (u − window, u], sampled every 5 minutes. The alert log,
 * the reading cards, the vigilance board and the trend charts all read it
 * through here, so a rule cannot fire at 13:20 on one screen and 13:15 on
 * another.
 */

export const TALLY_STEP = 5 * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface RainGrid {
  start: number;
  cum: Float64Array;
}

const cache = new Map<string, RainGrid>();

/** Six days of rain ending at `end` (snapped to the grid), as a running sum. */
export function rainGrid(locationId: LocationId, end: number): RainGrid {
  const e = Math.floor(end / TALLY_STEP) * TALLY_STEP;
  const key = `${locationId}:${e}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const start = e - 6 * DAY;
  const n = (e - start) / TALLY_STEP + 1;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    cum[i + 1] = cum[i] + (rainfallMmHr(locationId, start + i * TALLY_STEP) * TALLY_STEP) / HOUR;
  }
  if (cache.size > 24) cache.clear();
  const grid = { start, cum };
  cache.set(key, grid);
  return grid;
}

/** The tally at `u` over `windowMs`, from a grid that covers it. */
export function tallyAt(g: RainGrid, u: number, windowMs: number): number {
  const idx = (x: number) => Math.max(0, Math.min(g.cum.length - 1, Math.floor((x - g.start) / TALLY_STEP) + 1));
  return g.cum[idx(u)] - g.cum[idx(u - windowMs)];
}
