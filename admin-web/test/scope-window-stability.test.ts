import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// useScope reads the URL via next/navigation. Mock it to a stable, empty search so
// `scope` stays referentially stable and the only thing that can move the window is
// the clock — which is exactly what this regression guards.
vi.mock('next/navigation', () => {
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => ({ replace: () => {}, push: () => {} }),
    usePathname: () => '/',
    useSearchParams: () => searchParams,
  };
});

import { useScope } from '@/lib/hooks/use-scope';

/**
 * Regression for the met/history infinite-refetch loop: `useScope().window` fed a
 * query key, and computing `Date.now()` inline every render churned `from`/`to`
 * every render → key changes → refetch → re-render → refetch, forever. The window
 * is now minute-quantized + memoized, so it must be reference-stable within a minute
 * and advance by exactly one minute when the minute rolls over.
 */
describe('useScope window stability (refetch-loop regression)', () => {
  afterEach(() => vi.restoreAllMocks());

  // A clean minute boundary: 1_700_000_040_000 / 60_000 = 28_333_334 exactly.
  const base = 1_700_000_040_000;

  it('returns a reference-stable window across renders within the same minute', () => {
    let tick = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => base + tick);

    const { result, rerender } = renderHook(() => useScope());
    const first = result.current.window;

    // Several renders, each a little later but still inside the same minute.
    tick = 100; rerender();
    tick = 250; rerender();
    tick = 900; rerender();
    tick = 30_000; rerender();

    // Same object reference → same query key → no queryFn re-fire → no loop.
    expect(result.current.window).toBe(first);
  });

  it('advances the window by one minute when the minute rolls over', () => {
    let tick = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => base + tick);

    const { result, rerender } = renderHook(() => useScope());
    const first = result.current.window;

    tick = 60_000; // cross into the next minute
    rerender();

    expect(result.current.window).not.toBe(first);
    expect(result.current.window.to).toBe((first.to as number) + 60_000);
    expect(result.current.window.from).toBe((first.from as number) + 60_000);
  });
});
