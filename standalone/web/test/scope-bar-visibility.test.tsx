import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './utils';
import type { DashboardDevice } from '@/lib/api/types';

/**
 * The scope bar must appear ONLY where something reads it, and offer only the
 * controls that can change what is on screen.
 *
 * It was once drawn on seven routes that never call `useScope`, so "All types /
 * All devices / Last hour" wrote to the URL and changed nothing. A filter row
 * that visibly does nothing reads as broken, which is how it was reported.
 *
 * The same argument applies to the pickers themselves on THIS product: one PC,
 * one station. A station picker whose only entry is the station already on screen
 * is another control that cannot do anything — so with one station the bar keeps
 * just the period, and the audit log (which has period buttons of its own) loses
 * the bar entirely rather than showing two period controls that disagree.
 */
let pathname = '/';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const devices = vi.fn((): DashboardDevice[] => []);
vi.mock('@/features/dashboard/use-dashboard', () => ({
  useDashboardDevices: () => ({ data: devices() }),
}));

const { ScopeBar } = await import('@/components/scope/scope-bar');

const station = (id: string): DashboardDevice =>
  ({ _id: id, name: id, bleId: id, type: 'MET-LINK', firmwareVersion: null, lastSeenAt: null, isOnline: true, lastBatteryPct: null, lastBatteryCharging: null }) as DashboardDevice;

const renderAt = (p: string) => {
  pathname = p;
  return renderWithProviders(<ScopeBar />);
};

beforeEach(() => {
  devices.mockReturnValue([station('one')]);
});

const HIDDEN = [
  '/records/6a9ec3e3b5843053171704f3', // pinned to one record
  '/devices/6a8bfc4c6653f87fc268da81',
  '/alerts',
  '/notifications',
  '/users',
  '/settings',
  '/analytics',
  '/query',
  '/system',
  '/audit', // has its own period buttons
];

describe('scope bar visibility', () => {
  it.each(HIDDEN)('is hidden on %s, where nothing reads it', (p) => {
    const { unmount } = renderAt(p);
    expect(screen.queryByText('Scope')).toBeNull();
    expect(screen.queryByText('Period')).toBeNull();
    unmount();
  });

  describe('with one station (this product)', () => {
    it('keeps the period where something reads it, and drops the pickers', () => {
      for (const p of ['/', '/records']) {
        const { unmount } = renderAt(p);
        expect(screen.queryByText('Period')).toBeInTheDocument();
        expect(screen.queryByLabelText('Date range')).toBeInTheDocument();
        expect(screen.queryByLabelText('Device type')).toBeNull();
        unmount();
      }
    });

    it('shows nothing at all on Stations, where neither control would do anything', () => {
      const { unmount } = renderAt('/devices');
      expect(screen.queryByText('Scope')).toBeNull();
      expect(screen.queryByText('Period')).toBeNull();
      unmount();
    });
  });

  describe('with several stations', () => {
    beforeEach(() => {
      devices.mockReturnValue([station('a'), station('b')]);
    });

    it('offers the station and type pickers again', () => {
      const { unmount } = renderAt('/');
      expect(screen.queryByText('Scope')).toBeInTheDocument();
      expect(screen.queryByLabelText('Device type')).toBeInTheDocument();
      expect(screen.queryByLabelText('Date range')).toBeInTheDocument();
      unmount();
    });

    it('drops only the range on Stations, keeping the filters that work', () => {
      const { unmount } = renderAt('/devices');
      expect(screen.queryByText('Scope')).toBeInTheDocument();
      expect(screen.queryByLabelText('Device type')).toBeInTheDocument();
      expect(screen.queryByLabelText('Date range')).toBeNull();
      unmount();
    });
  });

  it('keeps a list scoped even though its detail page is not', () => {
    devices.mockReturnValue([station('a'), station('b')]);
    const a = renderAt('/records');
    expect(screen.queryByText('Scope')).toBeInTheDocument();
    a.unmount();
    const b = renderAt('/records/abc123');
    expect(screen.queryByText('Scope')).toBeNull();
    b.unmount();
  });
});
