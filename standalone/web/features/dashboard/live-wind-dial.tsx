'use client';

import { useEffect, useRef, useState } from 'react';
import { WindDial } from '@/components/charts/wind-dial';
import { useSocketEvent } from '@/lib/realtime/hooks';
import { ClientEvent, type MetLivePayload } from '@/lib/realtime/events';

/**
 * How long a live reading keeps the dial "live" after it arrives. The sensor sends
 * one a second; a few missed seconds is a hiccup, longer is a stopped stream, and
 * the dial should then say so rather than freeze on an old second.
 */
export const LIVE_FRESH_MS = 5_000;

export interface LiveWind {
  speedMs: number | null;
  dirDeg: number | null;
}

/**
 * The station's wind, second by second, from `met:live` — or null when no live
 * reading has arrived within `LIVE_FRESH_MS`.
 *
 * Freshness is timed from when the reading ARRIVED in this browser, not from its
 * timestamp: the site PC stamps readings with its own clock, and a viewer's PC
 * whose clock is a minute out would otherwise see the dial as permanently stale
 * (or permanently live).
 *
 * The caller must already be subscribed to the station's room — the dashboard is.
 */
export function useLiveWind(deviceId: string | undefined): LiveWind | null {
  const [live, setLive] = useState<LiveWind | null>(null);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useSocketEvent<MetLivePayload>(ClientEvent.MET_LIVE, (p) => {
    // A browser can be in several stations' rooms; follow only this one.
    if (!p || !deviceId || p.deviceId !== deviceId) return;
    setLive({ speedMs: p.windSpeedMs, dirDeg: p.windDirTrueDeg });
    clearTimeout(staleTimer.current);
    staleTimer.current = setTimeout(() => setLive(null), LIVE_FRESH_MS);
  });

  // A different station, or leaving the page: forget the last one's wind.
  useEffect(() => {
    setLive(null);
    return () => clearTimeout(staleTimer.current);
  }, [deviceId]);

  return live;
}

/**
 * The wind dial, moving every second.
 *
 * The client asked for every display to update once a minute *"except for the
 * wind dial that should have real time update"* (21 Sep 2026). So this dial alone
 * follows `met:live`; the gauges and tiles around it stay on the stored minute.
 * When the stream stops it falls back to that minute and says so, rather than
 * leaving a needle frozen on a second that is no longer "now".
 */
export function LiveWindDial({
  deviceId,
  minute,
  headingOffsetDeg,
  reference = null,
  speedUnit,
  formatSpeed,
}: {
  deviceId: string | undefined;
  /** The stored 1-minute reading — shown whenever there is no live one. */
  minute: { speedMs: number | null; speedKmh: number | null; dirDeg: number | null };
  headingOffsetDeg: number;
  reference?: 'magnetic' | 'mast' | null;
  speedUnit: string;
  formatSpeed: (ms: number | null) => string;
}) {
  const live = useLiveWind(deviceId);
  const speedMs = live ? live.speedMs : minute.speedMs;
  const dirDeg = live ? live.dirDeg : minute.dirDeg;

  return (
    <div className="flex flex-col items-center gap-1">
      <WindDial
        speedMs={speedMs}
        speedKmh={live ? (speedMs == null ? null : Math.round(speedMs * 3.6 * 100) / 100) : minute.speedKmh}
        dirDeg={dirDeg}
        headingOffsetDeg={headingOffsetDeg}
        reference={reference}
        speedUnit={speedUnit}
        formatSpeed={formatSpeed}
        label={live ? 'Wind, live' : 'Wind, 1-minute average'}
      />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="wind-dial-mode">
        {live ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-status-ok motion-safe:animate-pulse" aria-hidden />
            Live · every second
          </>
        ) : (
          '1-minute average'
        )}
      </p>
    </div>
  );
}
