import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { useDeviceSensors } from '@/lib/hooks/use-device-sensors';

/**
 * Per-device sensor availability (M16 W3).
 *
 * The station reports wind only, so the dashboard used to render five permanently
 * empty gauges and offer 15 analytics sensors of which 13 returned nothing. This
 * hook is the single source both surfaces consult.
 *
 * The behaviour that matters most is FAILING OPEN: hiding panels because a fetch
 * had not landed would be worse than briefly showing an empty one.
 */

const listDevices = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  listDevices: (...args: unknown[]) => listDevices(...args),
}));

const page = (rows: unknown[]) => ({ rows, page: 1, limit: 100, total: rows.length, pageCount: 1 });

function setup(deviceId?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useDeviceSensors(deviceId), { wrapper });
}

describe('useDeviceSensors', () => {
  beforeEach(() => listDevices.mockReset());

  it('reports the sensors a device actually has', async () => {
    listDevices.mockResolvedValue(page([{ _id: 'd1', availableSensors: ['wind_speed', 'wind_dir'], headingOffsetDeg: 0 }]));
    const { result } = setup('d1');

    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.keys).toEqual(['wind_speed', 'wind_dir']);
    expect(result.current.has('wind_speed')).toBe(true);
    expect(result.current.has('temperature')).toBe(false);
    expect(result.current.has('pressure')).toBe(false);
  });

  it('carries the heading offset so the dial knows if bearings are true', async () => {
    listDevices.mockResolvedValue(page([{ _id: 'd1', availableSensors: ['wind_speed'], headingOffsetDeg: 12 }]));
    const { result } = setup('d1');
    await waitFor(() => expect(result.current.headingOffsetDeg).toBe(12));
  });

  it('FAILS OPEN before the device list has loaded', () => {
    // Asserted on the FIRST render, while the query is still pending — exactly
    // the state under test. A never-resolving promise expresses the same thing
    // but keeps vitest alive after the run.
    listDevices.mockResolvedValue(page([{ _id: 'd1', availableSensors: ['wind_speed'] }]));
    const { result } = setup('d1');

    // No opinion yet — everything is shown rather than everything hidden.
    expect(result.current.known).toBe(false);
    expect(result.current.has('temperature')).toBe(true);
    expect(result.current.has('anything')).toBe(true);
  });

  it('fails open for a device that is not in the list', async () => {
    listDevices.mockResolvedValue(page([{ _id: 'other', availableSensors: ['wind_speed'] }]));
    const { result } = setup('missing');
    await waitFor(() => expect(listDevices).toHaveBeenCalled());
    expect(result.current.has('temperature')).toBe(true);
  });

  it('fails open for a device that has not ingested anything yet', async () => {
    // A freshly provisioned station has an empty list — that is "unknown", not
    // "has no sensors", so its panels must not all vanish.
    listDevices.mockResolvedValue(page([{ _id: 'd1', availableSensors: [] }]));
    const { result } = setup('d1');
    await waitFor(() => expect(listDevices).toHaveBeenCalled());
    expect(result.current.known).toBe(false);
    expect(result.current.has('temperature')).toBe(true);
  });

  it('fails open when no deviceId is given', async () => {
    listDevices.mockResolvedValue(page([{ _id: 'd1', availableSensors: ['wind_speed'] }]));
    const { result } = setup(undefined);
    await waitFor(() => expect(listDevices).toHaveBeenCalled());
    expect(result.current.has('temperature')).toBe(true);
  });

  it('defaults the heading offset to 0 when unknown', () => {
    listDevices.mockResolvedValue(page([{ _id: 'd1', availableSensors: ['wind_speed'] }]));
    const { result } = setup('d1');
    expect(result.current.headingOffsetDeg).toBe(0);
  });
});
