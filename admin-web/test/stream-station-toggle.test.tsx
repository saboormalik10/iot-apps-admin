import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { renderWithProviders } from './utils';
import { StreamTypesPage } from '@/features/streams/stream-types-page';
import { RbacProvider } from '@/lib/rbac/context';
import type { SessionUser, StreamTypeRow } from '@/lib/api/types';

/**
 * Toggling a station on the Stream types page needed a full page reload before
 * the switch moved.
 *
 * TWO separate causes, and fixing either alone leaves it broken:
 *
 *  1. The page held the whole stream-type ROW in `useState` when the dialog
 *     opened. Invalidating refetched the list and re-rendered the page, but the
 *     dialog kept rendering that captured object — so the new value existed in
 *     the cache and never reached the screen. The page now stores only the key
 *     and looks the row up from live query data.
 *
 *  2. Even once it did, the switch sat in its old position for the whole round
 *     trip, which reads as "the click didn't register" — and the natural
 *     response to that is to click again, undoing it. The mutation is now
 *     optimistic, with a rollback so a refused change cannot leave a station
 *     looking like it is ingesting when it is not.
 */

const listStreamTypes = vi.fn();
const setStationStreamEnabled = vi.fn();
const previewStreamType = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  listStreamTypes: (...a: unknown[]) => listStreamTypes(...a),
  setStationStreamEnabled: (...a: unknown[]) => setStationStreamEnabled(...a),
  previewStreamType: (...a: unknown[]) => previewStreamType(...a),
}));

const errorToast = vi.fn();
vi.mock('@/lib/hooks/use-api-toast', () => ({
  useApiToast: () => ({ success: vi.fn(), error: errorToast, info: vi.fn() }),
}));

const row = (stations: StreamTypeRow['stations']): StreamTypeRow =>
  ({
    id: 't1',
    key: 'met-csv',
    parserKey: 'met-csv',
    name: 'Wind / MET CSV',
    description: 'Wind readings',
    isBuiltIn: true,
    parserAvailable: true,
    stationCount: stations?.length ?? 0,
    columns: [],
    filenameHint: 'WindSonic_',
    stations,
  }) as StreamTypeRow;

const STATIONS: StreamTypeRow['stations'] = [
  {
    stationAccountId: 'sa1',
    deviceName: 'Demo Tower',
    organizationName: 'Acme Marine Services',
    account: 'wx-acme',
    folderPath: 'Acme/Demo Tower',
    isDefault: true,
    enabled: true,
  },
  {
    stationAccountId: 'sa2',
    deviceName: 'Auto Agent Tower',
    organizationName: 'new customer',
    account: 'wx-new',
    folderPath: 'new/Auto Agent Tower',
    isDefault: true,
    enabled: false,
  },
];

const superAdmin = {
  id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B',
  role: 'admin', organizationId: 'o1', isSuperAdmin: true, permissions: [],
} as unknown as SessionUser;

const setup = () =>
  renderWithProviders(
    <RbacProvider user={superAdmin}>
      <StreamTypesPage />
    </RbacProvider>,
  );

/** Open the stations dialog and return a scope limited to Demo Tower's row. */
const openDemoTowerRow = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.click(await screen.findByRole('button', { name: /view stations/i }));
  const item = (await screen.findByText('Demo Tower')).closest('li') as HTMLElement;
  return within(item);
};

beforeEach(() => {
  errorToast.mockReset();
  setStationStreamEnabled.mockReset();
  previewStreamType.mockReset().mockResolvedValue({ ok: true, rows: [] });
  listStreamTypes.mockReset().mockResolvedValue([row(structuredClone(STATIONS))]);
});

describe('stream type station toggle', () => {
  it('moves the switch without a reload', async () => {
    const u = userEvent.setup();

    // The server accepts, and the next list read reflects it — as the real one would.
    setStationStreamEnabled.mockImplementation(async (_k: string, id: string, enabled: boolean) => {
      const next = structuredClone(STATIONS)!.map((s) =>
        s.stationAccountId === id ? { ...s, enabled } : s,
      );
      listStreamTypes.mockResolvedValue([row(next)]);
      return { stationAccountId: id, streamType: 'met-csv', enabled };
    });

    setup();
    const demo = await openDemoTowerRow(u);
    expect(demo.getByText('Ingesting')).toBeInTheDocument();

    await u.click(demo.getByRole('switch'));

    // The assertion the bug was about: no reload, no reopening the dialog.
    await waitFor(() => expect(demo.getByText('Stopped')).toBeInTheDocument());
    expect(setStationStreamEnabled).toHaveBeenCalledWith('met-csv', 'sa1', false);
  });

  it('shows the new state before the server has answered', async () => {
    const u = userEvent.setup();
    let release: (v: unknown) => void = () => {};
    setStationStreamEnabled.mockImplementation(
      () => new Promise((res) => { release = res; }),
    );

    setup();
    const demo = await openDemoTowerRow(u);
    await u.click(demo.getByRole('switch'));

    // Still in flight — this is the optimistic patch, not the server's answer.
    await waitFor(() => expect(demo.getByText('Stopped')).toBeInTheDocument());
    expect(setStationStreamEnabled).toHaveBeenCalledTimes(1);

    release({ stationAccountId: 'sa1', streamType: 'met-csv', enabled: false });
  });

  it('rolls back when the server refuses, so a station never looks wrongly enabled', async () => {
    const u = userEvent.setup();
    setStationStreamEnabled.mockRejectedValue(new Error('nope'));

    setup();
    const demo = await openDemoTowerRow(u);
    expect(demo.getByText('Ingesting')).toBeInTheDocument();

    await u.click(demo.getByRole('switch'));

    await waitFor(() => expect(errorToast).toHaveBeenCalled());
    // Back to the truth, not left showing the change that did not happen.
    await waitFor(() => expect(demo.getByText('Ingesting')).toBeInTheDocument());
  });

  it('leaves the other stations alone while one is in flight', async () => {
    const u = userEvent.setup();
    let release: (v: unknown) => void = () => {};
    setStationStreamEnabled.mockImplementation(
      () => new Promise((res) => { release = res; }),
    );

    setup();
    const demo = await openDemoTowerRow(u);
    await u.click(demo.getByRole('switch'));

    // Only the row being changed is frozen; the rest stay usable.
    const other = within((await screen.findByText('Auto Agent Tower')).closest('li') as HTMLElement);
    expect(other.getByRole('switch')).not.toBeDisabled();
    expect(other.getByText('Stopped')).toBeInTheDocument();

    release({ stationAccountId: 'sa1', streamType: 'met-csv', enabled: false });
  });
});
