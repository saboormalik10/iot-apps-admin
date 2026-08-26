import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import React from 'react';

import { renderWithProviders } from './utils';
import { DryRunPanel } from '@/features/import/dry-run-panel';
import type { ImportDryRun } from '@/lib/api/types';

/**
 * Import dry-run panel (M22 W4).
 *
 * The wizard's own review is computed in the browser. This panel carries the
 * SERVER's answer to the two questions the browser cannot answer: has this exact
 * file already been imported, and which local days does it touch. The
 * already-imported warning is the one that saves real damage.
 */

const dryRunMetImport = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({ dryRunMetImport: (...a: unknown[]) => dryRunMetImport(...a) }));

const file = () => new File(['timestamp,direction\n'], 'WindSonic_20260825_1119.csv', { type: 'text/csv' });

const ok = (over: Partial<Extract<ImportDryRun, { ok: true }>> = {}): ImportDryRun =>
  ({
    ok: true,
    filename: 'WindSonic_20260825_1119.csv',
    deviceId: 'd1',
    deviceName: 'WindSonic — Sydney',
    timezone: 'Australia/Melbourne',
    streamType: 'met-csv',
    duplicateOf: null,
    rowsWouldInsert: 60,
    rowsParsed: 60,
    sensorsSeen: ['wind_speed', 'wind_dir'],
    unitCode: 'K',
    firstTsMs: 1,
    lastTsMs: 2,
    days: [{ dayKey: '2026-08-25', existingMeasures: 0, action: 'create' }],
    persisted: false,
    ...over,
  }) as ImportDryRun;

// No default parameter: `setup(undefined)` would silently substitute it, so the
// "no station chosen" case could never actually be tested.
const setup = (deviceId?: string) => renderWithProviders(<DryRunPanel file={file()} deviceId={deviceId} />);
const setupWithStation = () => setup('d1');

describe('DryRunPanel', () => {
  beforeEach(() => {
    dryRunMetImport.mockReset().mockResolvedValue(ok());
  });

  it('asks for a station before checking anything', () => {
    setup();
    expect(screen.getByText(/choose a station/i)).toBeInTheDocument();
    expect(dryRunMetImport).not.toHaveBeenCalled();
  });

  it('reports how many readings would be added, and to which station', async () => {
    setupWithStation();
    await waitFor(() => expect(dryRunMetImport).toHaveBeenCalled());
    expect(await screen.findByText(/60/)).toBeInTheDocument();
    expect(screen.getByText(/WindSonic — Sydney/)).toBeInTheDocument();
  });

  it('WARNS when these exact bytes were already imported', async () => {
    // The mistake this exists to catch. Without it, a double-click on a slow
    // upload looks identical to a successful first import.
    dryRunMetImport.mockResolvedValue(
      ok({ duplicateOf: { filename: 'earlier.csv', receivedAt: '2026-08-25T10:00:00.000Z', rows: 60 }, rowsWouldInsert: 0 }),
    );
    setupWithStation();
    expect(await screen.findByText(/already imported/i)).toBeInTheDocument();
    expect(screen.getByText(/earlier\.csv/)).toBeInTheDocument();
    expect(screen.getByText(/stores nothing/i)).toBeInTheDocument();
  });

  it('shows which local days are affected, and whether each is new', async () => {
    setupWithStation();
    expect(await screen.findByText(/2026-08-25 \(create\)/)).toBeInTheDocument();
  });

  it('says how much data a day already holds when appending', async () => {
    dryRunMetImport.mockResolvedValue(
      ok({ days: [{ dayKey: '2026-08-25', existingMeasures: 1440, action: 'append' }] }),
    );
    setupWithStation();
    expect(await screen.findByText(/append, 1440 existing/)).toBeInTheDocument();
  });

  it('names the TIME ZONE, since days are local not UTC', async () => {
    setupWithStation();
    expect(await screen.findByText('Australia/Melbourne')).toBeInTheDocument();
  });

  it('reports a file the server cannot read, rather than staying silent', async () => {
    dryRunMetImport.mockResolvedValue({ ok: false, reason: 'NO_TIMESTAMP_COLUMN' } as ImportDryRun);
    setupWithStation();
    expect(await screen.findByRole('alert')).toHaveTextContent(/NO_TIMESTAMP_COLUMN/);
    expect(screen.getByText(/would store nothing/i)).toBeInTheDocument();
  });

  it('surfaces a request failure', async () => {
    dryRunMetImport.mockRejectedValue(new Error('Device not found'));
    setupWithStation();
    expect(await screen.findByRole('alert')).toHaveTextContent(/device not found/i);
  });

  it('re-checks when the station changes', async () => {
    const { rerender } = renderWithProviders(<DryRunPanel file={file()} deviceId="d1" />);
    await waitFor(() => expect(dryRunMetImport).toHaveBeenCalledTimes(1));

    rerender(<DryRunPanel file={file()} deviceId="d2" />);
    await waitFor(() => expect(dryRunMetImport).toHaveBeenCalledTimes(2));
  });
});
