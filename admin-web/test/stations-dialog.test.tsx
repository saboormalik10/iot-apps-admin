import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import { renderWithProviders } from './utils';
import { StationsDialog } from '@/features/tenancy/stations-dialog';
import type { PlatformStation } from '@/lib/api/types';

/**
 * Station provisioning UI (M21 W2).
 *
 * Provisioning is ASYNCHRONOUS — the backend queues work for an agent on the
 * SFTP box — so the thing that matters most here is that a station which is not
 * yet receiving data never looks like one that is.
 */

const listStations = vi.fn();
const provisionStation = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  listStations: (...a: unknown[]) => listStations(...a),
  provisionStation: (...a: unknown[]) => provisionStation(...a),
}));

const success = vi.fn();
vi.mock('@/lib/hooks/use-api-toast', () => ({ useApiToast: () => ({ success, error: vi.fn() }) }));

const station = (over: Partial<PlatformStation> = {}): PlatformStation =>
  ({
    stationAccountId: 's1',
    account: 'wx-acme-marine',
    folderPath: 'Acme Marine/Demo Tower',
    deviceId: 'd1',
    isActive: true,
    lastIngestAt: null,
    notes: '',
    status: 'active',
    jobError: null,
    createdAt: '2026-08-25T00:00:00.000Z',
    ...over,
  }) as PlatformStation;

const setup = () =>
  renderWithProviders(
    <StationsDialog organizationId="o1" customerName="Acme Marine" open onOpenChange={() => {}} />,
  );

/**
 * Renders the dialog inside a client we control, so we can observe which query
 * keys a provisioning run invalidates. The customers table behind the dialog
 * reads `['platform','overview']`; if that key is never invalidated, the new
 * station only appears after a manual page reload — which is exactly what was
 * reported.
 */
function setupWithClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={qc}>
        <StationsDialog organizationId="o1" customerName="Acme Marine" open onOpenChange={() => {}} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  const invalidated = () => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey));
  return { qc, invalidated };
}

describe('StationsDialog', () => {
  beforeEach(() => {
    listStations.mockReset().mockResolvedValue([]);
    provisionStation.mockReset().mockResolvedValue({
      stationAccountId: 's2', deviceId: 'd2', account: 'wx-acme-marine',
      folderPath: 'Acme Marine/Tower B', status: 'pending', jobId: 'j1',
    });
    success.mockReset();
  });

  it('shows an active station as receiving', async () => {
    listStations.mockResolvedValue([station()]);
    setup();
    expect(await screen.findByText('Acme Marine/Demo Tower')).toBeInTheDocument();
    expect(screen.getByText(/receiving/i)).toBeInTheDocument();
  });

  it('does NOT show a pending station as receiving', async () => {
    // The whole point: a queued station has no Unix account yet, so files sent
    // to it are rejected. Showing it as ready would be a lie.
    listStations.mockResolvedValue([station({ isActive: false, status: 'queued' })]);
    setup();
    await screen.findByText('Acme Marine/Demo Tower');
    expect(screen.getByText(/waiting for the agent/i)).toBeInTheDocument();
    expect(screen.queryByText(/receiving/i)).not.toBeInTheDocument();
  });

  it('surfaces a failed job with its error, not a silent absence', async () => {
    listStations.mockResolvedValue([
      station({ isActive: false, status: 'failed', jobError: 'useradd exited 9' }),
    ]);
    setup();
    expect(await screen.findByText(/useradd exited 9/)).toBeInTheDocument();
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('shows the Unix account, which is what an operator needs to debug', async () => {
    listStations.mockResolvedValue([station()]);
    setup();
    expect(await screen.findByText('wx-acme-marine')).toBeInTheDocument();
  });

  it('queues a new station', async () => {
    const u = userEvent.setup();
    setup();
    await screen.findByText(/no stations yet/i);

    await u.type(screen.getByLabelText(/new station/i), 'Tower B');
    await u.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => expect(provisionStation).toHaveBeenCalled());
    expect(provisionStation.mock.calls[0][0]).toEqual({ organizationId: 'o1', towerName: 'Tower B' });
  });

  it('says the station is QUEUED, not created', async () => {
    const u = userEvent.setup();
    setup();
    await screen.findByText(/no stations yet/i);
    await u.type(screen.getByLabelText(/new station/i), 'Tower B');
    await u.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][0]).toMatch(/queued/i);
  });

  it('REFUSES a name with a path separator, before any request', async () => {
    const u = userEvent.setup();
    setup();
    await screen.findByText(/no stations yet/i);

    await u.type(screen.getByLabelText(/new station/i), '../etc');
    await u.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/letters, digits/i);
    expect(provisionStation).not.toHaveBeenCalled();
  });

  it('refuses shell metacharacters', async () => {
    const u = userEvent.setup();
    setup();
    await screen.findByText(/no stations yet/i);

    await u.type(screen.getByLabelText(/new station/i), 'Tower;id');
    await u.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(provisionStation).not.toHaveBeenCalled();
  });

  it('accepts a name with spaces — the client uses "Demo Tower"', async () => {
    const u = userEvent.setup();
    setup();
    await screen.findByText(/no stations yet/i);

    await u.type(screen.getByLabelText(/new station/i), 'Demo Tower');
    await u.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => expect(provisionStation).toHaveBeenCalled());
  });

  it('requires a name', async () => {
    const u = userEvent.setup();
    setup();
    await screen.findByText(/no stations yet/i);
    await u.click(screen.getByRole('button', { name: /add/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/give the tower a name/i);
  });

  it('surfaces a server rejection rather than claiming success', async () => {
    const u = userEvent.setup();
    provisionStation.mockRejectedValue(new Error('The folder "Acme Marine/Tower B" is already taken'));
    setup();
    await screen.findByText(/no stations yet/i);

    await u.type(screen.getByLabelText(/new station/i), 'Tower B');
    await u.click(screen.getByRole('button', { name: /add/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already taken/i);
    expect(success).not.toHaveBeenCalled();
  });

  /**
   * The customers table behind this dialog must not need a page reload.
   *
   * It reads `['platform','overview']`, and provisioning changes two things it
   * shows at two different moments: the DEVICE row is written as soon as the job
   * is queued (the Stations count), and the "Upload folders" column lists only
   * ACTIVE station accounts, which the agent activates seconds later. Only the
   * station list was ever invalidated, so both changes stayed invisible until
   * the page was reloaded by hand.
   */
  it('invalidates the customers overview when a station is queued', async () => {
    const u = userEvent.setup();
    const { invalidated } = setupWithClient();

    await u.type(screen.getByPlaceholderText(/tower|name/i), 'Tower B');
    await u.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => expect(provisionStation).toHaveBeenCalled());
    await waitFor(() => {
      expect(invalidated().some((k) => k?.includes('platform') && k?.includes('overview'))).toBe(true);
    });
    // and still refreshes its own list
    expect(invalidated().some((k) => k?.includes('stations'))).toBe(true);
  });

  it('invalidates the overview again when a pending station becomes ACTIVE', async () => {
    // The folder column only fills in on activation, which happens after the
    // queuing call has already returned.
    listStations.mockResolvedValue([station({ isActive: false, status: 'queued' })]);
    const { qc, invalidated } = setupWithClient();
    await waitFor(() => expect(listStations).toHaveBeenCalled());

    const before = invalidated().filter((k) => k?.includes('overview')).length;

    // The agent finishes: the next poll returns it active.
    listStations.mockResolvedValue([station({ isActive: true, status: 'active' })]);
    await qc.invalidateQueries({ queryKey: ['platform', 'stations', 'o1'] });

    await waitFor(() => {
      const after = invalidated().filter((k) => k?.includes('overview')).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});
