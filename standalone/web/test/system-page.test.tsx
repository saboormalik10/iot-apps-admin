import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, fireEvent, waitFor } from './utils';
import { server } from './msw/server';
import { SystemView, formatBytes } from '@/features/system/system-page';
import { RbacProvider } from '@/lib/rbac/context';
import type { SessionUser, SystemStatus } from '@/lib/api/types';

const admin = { id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'admin', organizationId: 'o1', permissions: ['system:read', 'device:write'] } as SessionUser;
const operator = { ...admin, role: 'operator', permissions: ['system:read'] } as SessionUser;
const as = (user: SessionUser, ui: ReactElement) => renderWithProviders(<RbacProvider user={user}>{ui}</RbacProvider>);

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
    connection: { mode: 'listen', remoteHost: null, remotePort: 4000, listenPort: 4000, source: 'file', changedAt: null, changedBy: null },
    bytesReceived: 7_200, linesReceived: 120, lastByteAt: '2026-09-22T11:59:59.000Z', columnMismatches: 0, unframed: 0,
    overflows: 0, headers: 1, fields: ['NODE', 'DIR', 'SPEED'], lastLine: '<STX>Q,090,004.00<ETX>4A', lastRejected: null, format: 'gill-ascii',
  },
  disk: { path: 'C:\\ObservatorData', freeBytes: 200 * 1024 ** 3, totalBytes: 500 * 1024 ** 3 },
  backup: { at: '2026-09-22T02:30:00.000Z', ok: true, path: 'C:\\ObservatorData\\backups\\x', bytes: 5_000_000, error: '' },
  warnings: [],
};

describe('System page', () => {
  it('says everything is working when it is', () => {
    as(admin, <SystemView s={base} />);
    expect(screen.getByText('Everything is working.')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Converter connects to this PC, port 4000')).toBeInTheDocument();
    expect(screen.getByText('200 GB of 500 GB')).toBeInTheDocument();
  });

  it('lists what needs attention, and marks the parts at fault', () => {
    as(
      admin,
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
    expect(screen.getByText('This PC connects to the converter at 192.168.1.50:4000')).toBeInTheDocument();
  });

  // Client, 9 Oct 2026: his converter is a TCP server and "there is nothing in the
  // software for me to setup the connection to the sensor/converter".
  describe('changing the sensor connection', () => {
    it('is offered to administrators only', () => {
      as(admin, <SystemView s={base} />);
      expect(screen.getByRole('button', { name: /change connection/i })).toBeInTheDocument();
      expect(screen.getByText('As set when the software was installed')).toBeInTheDocument();
    });

    it('is not offered to an operator', () => {
      as(operator, <SystemView s={base} />);
      expect(screen.queryByRole('button', { name: /change connection/i })).not.toBeInTheDocument();
    });

    it("says who changed it in the portal", () => {
      as(admin, <SystemView s={{ ...base, stream: { ...base.stream, connection: { ...base.stream.connection, source: 'portal', changedBy: 'tech@site.local', changedAt: '2026-10-09T01:00:00.000Z' } } }} />);
      expect(screen.getByText(/Set in the portal by tech@site.local/)).toBeInTheDocument();
    });

    it("needs the converter's address to dial it", async () => {
      let sent = false;
      server.use(http.put('/api/stream/connection', () => { sent = true; return HttpResponse.json({ data: {} }); }));
      as(admin, <SystemView s={base} />);
      fireEvent.click(screen.getByRole('button', { name: /change connection/i }));
      fireEvent.click(screen.getByLabelText(/this pc connects to the converter/i));
      fireEvent.click(screen.getByRole('button', { name: /save and connect/i }));
      expect(await screen.findByText("Enter the converter's IP address.")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Converter IP address'), { target: { value: 'not an ip!' } });
      fireEvent.click(screen.getByRole('button', { name: /save and connect/i }));
      expect(await screen.findByText(/Enter an IP address such as/)).toBeInTheDocument();
      expect(sent).toBe(false);
    });

    it('sends the converter address and then shows whether it answered', async () => {
      let body: unknown = null;
      server.use(
        http.put('/api/stream/connection', async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ data: {} });
        }),
        http.get('/api/system/status', () =>
          HttpResponse.json({
            data: { ...base, stream: { ...base.stream, mode: 'connect', remote: '192.168.10.50:4000', connected: true, remoteAddress: '192.168.10.50:4000', readingsLastMinute: 58 } },
          }),
        ),
      );
      as(admin, <SystemView s={base} />);
      fireEvent.click(screen.getByRole('button', { name: /change connection/i }));
      fireEvent.click(screen.getByLabelText(/this pc connects to the converter/i));
      fireEvent.change(screen.getByLabelText('Converter IP address'), { target: { value: ' 192.168.10.50 ' } });
      fireEvent.click(screen.getByRole('button', { name: /save and connect/i }));
      await waitFor(() => expect(body).toEqual({ mode: 'connect', remoteHost: '192.168.10.50', remotePort: 4000 }));
      expect(await screen.findByText(/This PC is now dialling the converter at 192.168.10.50:4000/)).toBeInTheDocument();
      expect(await screen.findByText(/58 readings in the last minute/)).toBeInTheDocument();
    });

    it('shows why the converter cannot be reached', async () => {
      server.use(
        http.put('/api/stream/connection', () => HttpResponse.json({ data: {} })),
        http.get('/api/system/status', () =>
          HttpResponse.json({
            data: { ...base, stream: { ...base.stream, mode: 'connect', connected: false, error: 'cannot reach the converter at 192.168.10.99:4000 — connect ETIMEDOUT' } },
          }),
        ),
      );
      as(admin, <SystemView s={base} />);
      fireEvent.click(screen.getByRole('button', { name: /change connection/i }));
      fireEvent.click(screen.getByLabelText(/this pc connects to the converter/i));
      fireEvent.change(screen.getByLabelText('Converter IP address'), { target: { value: '192.168.10.99' } });
      fireEvent.click(screen.getByRole('button', { name: /save and connect/i }));
      expect(await screen.findByText(/cannot reach the converter at 192.168.10.99:4000/)).toBeInTheDocument();
      expect(screen.getByText(/set to TCP Server/)).toBeInTheDocument();
    });
  });

  // Client, 9 Oct 2026: "Looks like is connected, BUT no data appearing".
  it('shows what arrives when a connected sensor gives no readings', () => {
    as(
      admin,
      <SystemView
        s={{
          ...base,
          stream: { ...base.stream, readingsLastMinute: 0, lastReadingAt: null, bytesReceived: 4_096, linesReceived: 52, columnMismatches: 52, lastLine: '<STX>Q,090,004.00,+20.0,060,1012.0,0000,<ETX>2B' },
          warnings: [{ code: 'SENSOR_NEVER', message: 'No reading from the sensor since the service started. Lines arrive, but with a different number of columns than expected (11).' }],
        }}
      />,
    );
    expect(screen.getByText('4.0 KB in 52 lines')).toBeInTheDocument();
    expect(screen.getByText('Not understood: wrong number of columns')).toBeInTheDocument();
    expect(screen.getByText('<STX>Q,090,004.00,+20.0,060,1012.0,0000,<ETX>2B')).toBeInTheDocument();
    expect(screen.getByText(/different number of columns/)).toBeInTheDocument();
  });

  it('says plainly when a connected converter sends nothing', () => {
    as(admin, <SystemView s={{ ...base, stream: { ...base.stream, readingsLastMinute: 0, bytesReceived: 0, linesReceived: 0, lastLine: null } }} />);
    expect(screen.getByText('nothing yet')).toBeInTheDocument();
    expect(screen.queryByText('Last line received')).not.toBeInTheDocument();
  });

  // Client, 9 Oct 2026: his sensor spoke NMEA; support needed more than the last line.
  it('names the data format and offers the recent lines as a file', async () => {
    server.use(
      http.get('/api/stream/recent-lines', () =>
        HttpResponse.json({
          data: [
            { at: '2026-10-09T03:00:00.000Z', line: '$WIMWV,090,R,010.00,N,A*2B', outcome: 'reading' },
            { at: '2026-10-09T03:00:00.000Z', line: '$PGILT,A,+31,D,-58,D,+1,TILT*3D', outcome: 'part of a reading' },
          ],
        }),
      ),
    );
    as(operator, <SystemView s={{ ...base, stream: { ...base.stream, format: 'nmea' } }} />);
    expect(screen.getByText('NMEA 0183')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /recent lines/i }));
    const box = (await screen.findByLabelText('Recent lines')) as HTMLTextAreaElement;
    expect(box.value).toContain('$PGILT,A,+31,D,-58,D,+1,TILT*3D    [part of a reading]');
    expect(screen.getByRole('button', { name: /download as text file/i })).toBeEnabled();
  });

  it('writes sizes the way people read them', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    expect(formatBytes(null)).toBe('–');
  });
});
