import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { renderWithProviders } from './utils';
import { StreamPreviewPanel } from '@/features/streams/stream-preview';
import type { StreamPreview } from '@/lib/api/types';

/**
 * Sample preview (M22 W3).
 *
 * The screen exists so an operator can answer "will this file work?" before a
 * customer starts sending. Two things must be unmistakable: nothing is written,
 * and any column the parser ignored is NAMED — a silently dropped column is the
 * exact mystery this prevents.
 */

const previewStream = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({ previewStream: (...a: unknown[]) => previewStream(...a) }));

const result = (over: Partial<StreamPreview> = {}): StreamPreview =>
  ({
    streamKey: 'met-csv',
    parserKey: 'met-csv',
    filename: null,
    ok: true,
    rejectReason: null,
    header: ['timestamp', 'direction', 'speed', 'units', 'status'],
    recognisedColumns: ['timestamp', 'direction', 'speed', 'units', 'status'],
    ignoredColumns: [],
    sensorsSeen: ['wind_speed', 'wind_dir'],
    unitCode: 'K',
    stats: { totalLines: 3, dataLines: 2, skipped: 0, truncatedTail: false, firstTsMs: 1, lastTsMs: 2 },
    sampleRows: [
      { timestampMs: 1, timestamp: '2026-08-25T01:19:00.000Z', windSpeedMs: 0.139, windDirRelDeg: 350, tempC: null, humidityPct: null, pressureHpa: null },
    ],
    totalRows: 2,
    persisted: false,
    ...over,
  }) as StreamPreview;

const setup = () => renderWithProviders(<StreamPreviewPanel streamKey="met-csv" />);

const paste = async (u: ReturnType<typeof userEvent.setup>, text: string) => {
  const box = screen.getByLabelText(/sample rows/i);
  await u.click(box);
  await u.paste(text);
};

describe('StreamPreviewPanel', () => {
  beforeEach(() => {
    previewStream.mockReset().mockResolvedValue(result());
  });

  it('says nothing is saved, before you even press it', () => {
    setup();
    expect(screen.getByText(/nothing is saved/i)).toBeInTheDocument();
  });

  it('requires something to preview', async () => {
    const u = userEvent.setup();
    setup();
    await u.click(screen.getByRole('button', { name: /preview/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/paste a few rows/i);
    expect(previewStream).not.toHaveBeenCalled();
  });

  it('sends the pasted sample with its stream key', async () => {
    const u = userEvent.setup();
    setup();
    await paste(u, 'timestamp,direction\n2026-08-25T11:19:00+10:00,350');
    await u.click(screen.getByRole('button', { name: /preview/i }));

    await waitFor(() => expect(previewStream).toHaveBeenCalled());
    expect(previewStream.mock.calls[0][0]).toMatchObject({ streamKey: 'met-csv' });
  });

  it('reports how many rows WOULD be stored', async () => {
    const u = userEvent.setup();
    setup();
    await paste(u, 'x');
    await u.click(screen.getByRole('button', { name: /preview/i }));
    expect(await screen.findByText(/2 rows would be stored/i)).toBeInTheDocument();
  });

  it('NAMES an ignored column', async () => {
    const u = userEvent.setup();
    previewStream.mockResolvedValue(result({ ignoredColumns: ['salinity'] }));
    setup();
    await paste(u, 'x');
    await u.click(screen.getByRole('button', { name: /preview/i }));

    expect(await screen.findByText(/does not recognise them/i)).toBeInTheDocument();
    expect(screen.getByText('salinity')).toBeInTheDocument();
  });

  it('says nothing about ignored columns when there are none', async () => {
    const u = userEvent.setup();
    setup();
    await paste(u, 'x');
    await u.click(screen.getByRole('button', { name: /preview/i }));
    await screen.findByText(/2 rows would be stored/i);
    expect(screen.queryByText(/does not recognise them/i)).not.toBeInTheDocument();
  });

  it('reports a file that cannot be read, with the reason', async () => {
    const u = userEvent.setup();
    previewStream.mockResolvedValue(result({ ok: false, rejectReason: 'NO_TIMESTAMP_COLUMN', totalRows: 0, sampleRows: [] }));
    setup();
    await paste(u, 'x');
    await u.click(screen.getByRole('button', { name: /preview/i }));

    expect(await screen.findByText(/NO_TIMESTAMP_COLUMN/)).toBeInTheDocument();
  });

  it('shows the parsed rows as they would be stored', async () => {
    const u = userEvent.setup();
    setup();
    await paste(u, 'x');
    await u.click(screen.getByRole('button', { name: /preview/i }));

    expect(await screen.findByText('2026-08-25T01:19:00.000Z')).toBeInTheDocument();
    expect(screen.getByText('0.139')).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
  });

  it('surfaces a server rejection instead of a blank panel', async () => {
    const u = userEvent.setup();
    previewStream.mockRejectedValue(new Error('No stream type named "water-quality"'));
    setup();
    await paste(u, 'x');
    await u.click(screen.getByRole('button', { name: /preview/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no stream type named/i);
  });
});
