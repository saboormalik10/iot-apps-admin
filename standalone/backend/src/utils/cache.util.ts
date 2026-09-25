/**
 * Shared in-process TTL cache + downsample helpers.
 *
 * Mirrors the inline cache used by `dashboard.service.ts` so the analytics
 * module can reuse the same 30-second-cache pattern without an external
 * dependency (Redis). Keys are namespaced by the caller.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export const DEFAULT_TTL_MS = 30_000;

export function fromCache<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  if (entry) store.delete(key);
  return null;
}

export function toCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): T {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

/** Evenly-spaced downsample: keep at most `maxPoints` items, preserving order. */
export function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = arr.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, i) => arr[Math.floor(i * step)]);
}

/** A min/avg/max time-bucketed point (as produced by the MET history pipeline). */
export interface EnvelopePoint {
  timestampMs: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

/**
 * Peak-preserving downsample for min/avg/max time-bucketed series.
 *
 * Unlike `downsample` — which drops whole points and can silently erase spikes
 * (a gust that lands on a discarded index disappears) — this MERGES contiguous
 * input buckets into at most `maxPoints` output buckets, keeping the min-of-mins
 * and max-of-maxes and a count-weighted average. The visible envelope (the
 * min/max band the chart draws) is therefore preserved at any target size, so
 * callers can cap far lower without losing the shape of the data.
 */
export function downsampleEnvelope<T extends EnvelopePoint>(arr: T[], maxPoints: number): EnvelopePoint[] {
  if (arr.length <= maxPoints) return arr;
  const groupSize = arr.length / maxPoints;
  const out: EnvelopePoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * groupSize);
    const end = Math.min(arr.length, Math.floor((i + 1) * groupSize));
    if (end <= start) continue;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      const p = arr[j];
      if (p.min < min) min = p.min;
      if (p.max > max) max = p.max;
      sum += p.avg * p.count;
      count += p.count;
    }
    const round2 = (n: number) => Math.round(n * 100) / 100;
    out.push({
      timestampMs: arr[start].timestampMs,
      min: round2(min),
      max: round2(max),
      avg: count ? round2(sum / count) : 0,
      count,
    });
  }
  return out;
}
