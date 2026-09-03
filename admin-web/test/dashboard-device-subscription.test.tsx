import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * M25 — the dashboard must JOIN the device room.
 *
 * `met:latest` is emitted server-side with `server.to(roomForDevice(deviceId))`.
 * A client that never sends `subscribe:device` is not in that room and receives
 * nothing, so every socket handler the dashboard registered was dead: the live
 * panel only changed on a refetch or a remount.
 *
 * The device-detail screen always subscribed, which is why the push demonstrably
 * worked there and this gap went unnoticed.
 */
const searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => searchParams,
}));

const subscribed: (string | undefined)[] = [];
vi.mock('@/lib/realtime/hooks', () => ({
  useSocketEvent: () => {},
  useDeviceSubscription: (deviceId?: string) => {
    subscribed.push(deviceId);
  },
  useOnReconnect: () => {},
}));

import { useDashboardRealtime } from '@/features/dashboard/use-dashboard-realtime';

function mount(ids: { met?: string; nep?: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderHook(() => useDashboardRealtime(ids), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

describe('dashboard device subscription', () => {
  beforeEach(() => {
    subscribed.length = 0;
  });

  it('subscribes to the MET device room', () => {
    mount({ met: 'met-1' });
    expect(subscribed).toContain('met-1');
  });

  it('subscribes to the NEP device room too', () => {
    mount({ met: 'met-1', nep: 'nep-1' });
    expect(subscribed).toContain('nep-1');
  });

  it('subscribes to nothing when no device is selected', () => {
    mount({});
    // The hook is still called — it no-ops on an undefined id — but no real room
    // is ever joined.
    expect(subscribed.filter(Boolean)).toEqual([]);
  });
});
