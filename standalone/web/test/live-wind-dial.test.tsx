import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

/**
 * The real-time wind dial (client, 21 Sep 2026: every display updates once a
 * minute "except for the wind dial that should have real time update").
 *
 * The socket is replaced by the handler the component registers, so a test can
 * deliver `met:live` readings exactly as the gateway would.
 */
const handlers = new Map<string, (p: unknown) => void>();
vi.mock('@/lib/realtime/hooks', () => ({
  useSocketEvent: (event: string, handler: (p: unknown) => void) => {
    handlers.set(event, handler);
  },
}));

import { LiveWindDial, LIVE_FRESH_MS } from '@/features/dashboard/live-wind-dial';
import { ClientEvent } from '@/lib/realtime/events';

const STATION = 'station-1';
const minute = { speedMs: 4, speedKmh: 14.4, dirDeg: 180 };
const fmt = (ms: number | null) => (ms == null ? '–' : ms.toFixed(2));

const renderDial = () =>
  render(<LiveWindDial deviceId={STATION} minute={minute} headingOffsetDeg={10} speedUnit="m/s" formatSpeed={fmt} />);

const liveReading = (p: { deviceId?: string; windSpeedMs: number | null; windDirTrueDeg: number | null }) =>
  act(() => handlers.get(ClientEvent.MET_LIVE)!({ deviceId: STATION, measuredAtMs: Date.now(), ...p }));

describe('LiveWindDial', () => {
  beforeEach(() => {
    handlers.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('shows the stored minute until a live reading arrives, and says so', () => {
    renderDial();
    expect(screen.getByTestId('wind-dial-mode')).toHaveTextContent('1-minute average');
    expect(screen.getByText('4.00')).toBeInTheDocument();
  });

  it('follows each live reading, second by second', () => {
    renderDial();
    liveReading({ windSpeedMs: 7.25, windDirTrueDeg: 90 });
    expect(screen.getByTestId('wind-dial-mode')).toHaveTextContent('Live · every second');
    expect(screen.getByText('7.25')).toBeInTheDocument();

    liveReading({ windSpeedMs: 8.5, windDirTrueDeg: 95 });
    expect(screen.getByText('8.50')).toBeInTheDocument();
  });

  it('ignores readings for a different station', () => {
    renderDial();
    liveReading({ deviceId: 'another-station', windSpeedMs: 30, windDirTrueDeg: 0 });
    expect(screen.getByTestId('wind-dial-mode')).toHaveTextContent('1-minute average');
    expect(screen.queryByText('30.00')).not.toBeInTheDocument();
  });

  it('falls back to the minute when the stream stops, rather than freezing', () => {
    renderDial();
    liveReading({ windSpeedMs: 7.25, windDirTrueDeg: 90 });
    act(() => vi.advanceTimersByTime(LIVE_FRESH_MS - 100));
    expect(screen.getByTestId('wind-dial-mode')).toHaveTextContent('Live');

    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByTestId('wind-dial-mode')).toHaveTextContent('1-minute average');
    expect(screen.getByText('4.00')).toBeInTheDocument();
  });

  it('shows a flagged live reading as no reading, not as the old value', () => {
    renderDial();
    liveReading({ windSpeedMs: null, windDirTrueDeg: null });
    expect(screen.getByTestId('wind-dial-mode')).toHaveTextContent('Live');
    expect(screen.queryByText('4.00')).not.toBeInTheDocument();
  });
});
