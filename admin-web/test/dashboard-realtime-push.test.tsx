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
  beforeEach(() => handlers.clear());

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
