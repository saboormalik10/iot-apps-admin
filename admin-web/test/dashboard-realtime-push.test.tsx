import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { useDashboardRealtime } from '@/features/dashboard/use-dashboard-realtime';
import { queryKeys } from '@/lib/query/keys';
import type { MetLatestPayload } from '@/lib/realtime/events';

/**
 * Push-driven `met:latest` (M16 W2).
 *
 * The event used to be discarded and the reading refetched. The station reports
 * once a minute, so waiting a round trip to display a number already in hand made
 * the live dial lag its own event.
 *
 * What must hold:
 *   - the pushed reading lands in the cache immediately;
 *   - it MERGES, so fields the socket does not send survive;
 *   - it does not seed a partial object before the first fetch.
 */

// The hook reads the scope-bar window to decide whether a pushed reading belongs
// in the SCOPED cache entry as well as the live one, so next/navigation has to be
// mocked the way `scope-window-stability.test.ts` does it.
const searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => searchParams,
}));

// One shared handler registry so the test can fire events at the hook.
const handlers = new Map<string, (p: unknown) => void>();
vi.mock('@/lib/realtime/hooks', () => ({
  useSocketEvent: (event: string, handler: (p: unknown) => void) => {
    handlers.set(event, handler);
  },
  useDeviceSubscription: () => {},
  useOnReconnect: () => {},
}));

const DEVICE = 'dev-1';

const payload: MetLatestPayload = {
  measuredAtMs: Date.parse('2026-08-25T04:09:00Z'),
  recordId: 'rec-9',
  windSpeedMs: 2.5,
  windSpeedKmh: 9,
  windDirTrueDeg: 210,
  windDirRelDeg: 210,
  tempC: null,
  humidityPct: null,
  pressureHpa: null,
  dewPointC: null,
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  renderHook(() => useDashboardRealtime({ met: DEVICE }), { wrapper });
  return qc;
}

const fire = (p: unknown) => handlers.get('met:latest')?.(p);

describe('met:latest push', () => {
  beforeEach(() => {
    handlers.clear();
    searchParams.forEach((_v, k) => searchParams.delete(k));
  });

  it('applies the pushed reading to the cache without a refetch', () => {
    const qc = setup();
    qc.setQueryData(queryKeys.metLatest(DEVICE), {
      deviceName: 'WindSonic — Sydney',
      headingOffsetDeg: 0,
      windSpeedKmh: 1.8,
      measuredAt: '2026-08-25T04:08:00.000Z',
    });

    fire(payload);

    const next = qc.getQueryData<Record<string, unknown>>(queryKeys.metLatest(DEVICE));
    expect(next?.windSpeedKmh).toBe(9);
    expect(next?.windDirTrueDeg).toBe(210);
  });

  it('MERGES — fields the socket does not send survive', () => {
    const qc = setup();
    qc.setQueryData(queryKeys.metLatest(DEVICE), {
      deviceName: 'WindSonic — Sydney',
      headingOffsetDeg: 12,
      windSpeedKmh: 1.8,
    });

    fire(payload);

    const next = qc.getQueryData<Record<string, unknown>>(queryKeys.metLatest(DEVICE));
    // Neither of these is in the payload; replacing instead of merging would
    // blank them and the dial would lose its name and calibration state.
    expect(next?.deviceName).toBe('WindSonic — Sydney');
    expect(next?.headingOffsetDeg).toBe(12);
  });

  it('derives the ISO timestamp from the pushed epoch', () => {
    const qc = setup();
    qc.setQueryData(queryKeys.metLatest(DEVICE), { deviceName: 'x', measuredAt: 'old' });

    fire(payload);

    expect(qc.getQueryData<Record<string, unknown>>(queryKeys.metLatest(DEVICE))?.measuredAt).toBe(
      '2026-08-25T04:09:00.000Z',
    );
  });

  it('does NOT seed a partial reading before the first fetch', () => {
    const qc = setup();
    // Nothing cached yet.
    fire(payload);
    expect(qc.getQueryData(queryKeys.metLatest(DEVICE))).toBeUndefined();
  });

  it('ignores a malformed payload rather than corrupting the cache', () => {
    const qc = setup();
    qc.setQueryData(queryKeys.metLatest(DEVICE), { deviceName: 'x', windSpeedKmh: 1.8 });

    fire({ nonsense: true });
    fire(null);

    const next = qc.getQueryData<Record<string, unknown>>(queryKeys.metLatest(DEVICE));
    expect(next?.windSpeedKmh).toBe(1.8);
    expect(next?.deviceName).toBe('x');
  });
});

/**
 * M25 — a pushed reading raises the range summary's MAX in place.
 *
 * The summary spans hours or days, so refetching it on every reading would be a
 * round trip per reading and the mean would not visibly move for any of them. The
 * maximum is the exception: a new peak is the number being watched, so it is
 * patched immediately and the rest waits for the next natural refetch.
 */
describe('met:latest push — range summary', () => {
  beforeEach(() => {
    handlers.clear();
    searchParams.forEach((_v, k) => searchParams.delete(k));
  });

  const summaryKey = (fromMs: number, toMs: number) =>
    queryKeys.metRangeSummary(DEVICE, 'wind_speed', `${fromMs}-${toMs}`);

  // Derived exactly as `useScope` does: `to` is the minute bucket, `from` is that
  // minus the preset span. Re-inventing it here would test a window the app never
  // actually uses.
  const currentWindow = (spanMs: number) => {
    const to = Math.floor(Date.now() / 60_000) * 60_000;
    return [to - spanMs, to] as const;
  };

  it('raises the max when a reading beats it', () => {
    searchParams.set('range', '24h');
    const qc = setup();
    const [from, to] = currentWindow(86_400_000);
    qc.setQueryData(summaryKey(from, to), { sensor: 'wind_speed', unit: 'm/s', count: 100, min: null, mean: 1, max: 2, basis: 'measures' });

    fire({ ...payload, measuredAtMs: Date.now() - 5_000, windSpeedMs: 7.5 });

    expect(qc.getQueryData<Record<string, unknown>>(summaryKey(from, to))?.max).toBe(7.5);
  });

  it('leaves the max alone when the reading does not beat it', () => {
    searchParams.set('range', '24h');
    const qc = setup();
    const [from, to] = currentWindow(86_400_000);
    qc.setQueryData(summaryKey(from, to), { sensor: 'wind_speed', unit: 'm/s', count: 100, min: null, mean: 1, max: 9, basis: 'measures' });

    fire({ ...payload, measuredAtMs: Date.now() - 5_000, windSpeedMs: 2.5 });

    // A maximum is monotonic within its window — a quiet second must not lower it.
    expect(qc.getQueryData<Record<string, unknown>>(summaryKey(from, to))?.max).toBe(9);
  });

  it('ignores a reading that falls outside the window', () => {
    searchParams.set('range', '1h');
    const qc = setup();
    const [from, to] = currentWindow(3_600_000);
    qc.setQueryData(summaryKey(from, to), { sensor: 'wind_speed', unit: 'm/s', count: 10, min: null, mean: 1, max: 2, basis: 'measures' });

    // `payload` is dated 2026-08-25 — nowhere near a one-hour window. Patching it
    // in would put a reading from another week into this window's maximum.
    fire({ ...payload, windSpeedMs: 99 });

    expect(qc.getQueryData<Record<string, unknown>>(summaryKey(from, to))?.max).toBe(2);
  });

  it('does not seed a summary that has not been fetched', () => {
    searchParams.set('range', '24h');
    const qc = setup();
    const [from, to] = currentWindow(86_400_000);

    fire({ ...payload, measuredAtMs: Date.now(), windSpeedMs: 7.5 });

    expect(qc.getQueryData(summaryKey(from, to))).toBeUndefined();
  });
});
