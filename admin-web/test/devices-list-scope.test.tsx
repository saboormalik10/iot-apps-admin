import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { renderWithProviders } from './utils';
import { DevicesList } from '@/features/devices/devices-list';
import type { Device } from '@/lib/api/types';

/**
 * The Stations table follows the navbar customer dropdown — for a platform
 * administrator too.
 *
 * It used to have a second mode: an unswitched super admin saw every customer's
 * stations, chosen by an in-page "Customer" filter. Two controls then decided
 * the organisation and they disagreed, so clicking a row belonging to another
 * customer opened a detail page that is scoped to the ACTING organisation and
 * answered "Device not found" for a station the table had just listed.
 */

const listDevices = vi.fn();
const listPlatformDevices = vi.fn();
const listDeviceCustomers = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  listDevices: (...a: unknown[]) => listDevices(...a),
  listPlatformDevices: (...a: unknown[]) => listPlatformDevices(...a),
  listDeviceCustomers: (...a: unknown[]) => listDeviceCustomers(...a),
}));

// DevicesList → useScope reads the station-type filter off the URL.
const push = vi.fn();
vi.mock('next/navigation', () => {
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => ({ push, replace: () => {} }),
    usePathname: () => '/devices',
    useSearchParams: () => searchParams,
  };
});

const rbac = { isSuperAdmin: true, user: { organizationId: 'acme', homeOrganizationId: null } };
vi.mock('@/lib/rbac/context', () => ({ useRbac: () => rbac }));

const device = (over: Partial<Device> = {}): Device =>
  ({
    _id: 'd1',
    name: 'Tower 1',
    customName: null,
    type: 'MET-LINK',
    isOnline: true,
    lastSeenAt: null,
    lastBatteryPct: null,
    ...over,
  }) as Device;

beforeEach(() => {
  vi.clearAllMocks();
  rbac.isSuperAdmin = true;
  rbac.user = { organizationId: 'acme', homeOrganizationId: null };
  listDevices.mockResolvedValue({ rows: [device()], page: 1, limit: 20, total: 1, pageCount: 1 });
  listPlatformDevices.mockResolvedValue({ rows: [], page: 1, limit: 1, total: 42, pageCount: 42 });
  listDeviceCustomers.mockResolvedValue([]);
});

describe('Stations list — tenancy', () => {
  it('lists through the org-scoped endpoint even for an unswitched super admin', async () => {
    renderWithProviders(<DevicesList />);
    await waitFor(() => expect(screen.getByText('Tower 1')).toBeInTheDocument());
    expect(listDevices).toHaveBeenCalled();
  });

  it('never lists rows through the cross-customer endpoint', async () => {
    /**
     * The load-bearing assertion. If the platform endpoint is ever wired back
     * into the TABLE, rows for customers the user is not acting as reappear and
     * every one of them 404s on click.
     */
    renderWithProviders(<DevicesList />);
    await waitFor(() => expect(screen.getByText('Tower 1')).toBeInTheDocument());

    const rowFetches = listPlatformDevices.mock.calls.filter(
      ([params]) => (params as { limit?: number })?.limit !== 1,
    );
    expect(rowFetches).toHaveLength(0);
  });

  it('offers no second organisation control on the page', async () => {
    renderWithProviders(<DevicesList />);
    await waitFor(() => expect(screen.getByText('Tower 1')).toBeInTheDocument());
    // Asserted on the ROLE: the old control was a combobox, and matching on the
    // words "all customers" would now also match the fleet-count line.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByLabelText(/^customer$/i)).toBeNull();
  });

  it('still shows the platform-wide station count to a super admin', async () => {
    // The fleet size is information a platform administrator needs; only the
    // LISTING narrowed, not the count.
    renderWithProviders(<DevicesList />);
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.getByText(/across all customers/i)).toBeInTheDocument();
  });

  it('shows no fleet count to an ordinary customer', async () => {
    rbac.isSuperAdmin = false;
    renderWithProviders(<DevicesList />);
    await waitFor(() => expect(screen.getByText('Tower 1')).toBeInTheDocument());
    expect(screen.queryByText(/across all customers/i)).toBeNull();
    expect(listPlatformDevices).not.toHaveBeenCalled();
  });

  it('opens the row it listed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicesList />);
    await waitFor(() => expect(screen.getByText('Tower 1')).toBeInTheDocument());
    await user.click(screen.getByText('Tower 1'));
    expect(push).toHaveBeenCalledWith('/devices/d1');
  });
});
