import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen } from './utils';
import { SystemView, formatBytes } from '@/features/system/system-page';
import type { SystemStatus } from '@/lib/api/types';

/** Phase 7 — the site PC's health, readable at a glance. */
const base: SystemStatus = {
  version: '1.0.0',
  now: '2026-09-22T12:00:00.000Z',
  pcTimeZone: 'Australia/Melbourne',
  uptimeSec: 90_000,
  node: 'v24.21.0',
  db: { connected: true, dataBytes: 1_000_000, storageBytes: 2_500_000, latestMinuteAt: '2026-09-22T11:59:00.000Z' },
  stream: {
    enabled: true, mode: 'listen', port: 4000, remote: null, listening: true, connected: true,
    remoteAddress: '192.168.1.50', connectedAt: '2026-09-22T10:00:00.000Z', lastReadingAt: '2026-09-22T11:59:59.000Z',
    readingsLastMinute: 60, minutesWritten: 120, lastMinuteWrittenAt: '2026-09-22T11:59:05.000Z',
    checksumErrors: 0, rainAnomalies: 0, error: null,
  },
  disk: { path: 'C:\\ObservatorData', freeBytes: 200 * 1024 ** 3, totalBytes: 500 * 1024 ** 3 },
  backup: { at: '2026-09-22T02:30:00.000Z', ok: true, path: 'C:\\ObservatorData\\backups\\x', bytes: 5_000_000, error: '' },
  warnings: [],
};

describe('System page', () => {
  it('says everything is working when it is', () => {
    renderWithProviders(<SystemView s={base} />);
    expect(screen.getByText('Everything is working.')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Converter connects to this PC, port 4000')).toBeInTheDocument();
    expect(screen.getByText('200 GB of 500 GB')).toBeInTheDocument();
  });

  it('lists what needs attention, and marks the parts at fault', () => {
    renderWithProviders(
      <SystemView
        s={{
          ...base,
          stream: { ...base.stream, connected: false, mode: 'connect', remote: '192.168.1.50:4000' },
          backup: { ...base.backup!, ok: false, error: 'mongodump failed (1)' },
          warnings: [
            { code: 'SENSOR_QUIET', message: 'No reading from the sensor for 12 minutes.' },
            { code: 'BACKUP_FAILED', message: 'The last backup failed: mongodump failed (1)' },
          ],
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('2 things need attention');
    expect(screen.getByText('No reading from the sensor for 12 minutes.')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('This PC dials 192.168.1.50:4000')).toBeInTheDocument();
  });

  it('writes sizes the way people read them', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    expect(formatBytes(null)).toBe('–');
  });
});
