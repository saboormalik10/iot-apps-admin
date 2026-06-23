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
