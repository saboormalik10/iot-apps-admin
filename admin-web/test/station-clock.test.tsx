import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { renderWithProviders } from './utils';
import { StationClock } from '@/components/app-shell/station-clock';
import { zoneLabel } from '@/lib/time/zone-label';

/**
 * The top-bar clock.
 *
 * It shows the STATION's local time, not the viewer's. Every reading in the
 * portal is stamped in the station's zone, and the people reading it are often
 * in another country — a clock on the viewer's zone would disagree with every
 * timestamp on screen, which is worse than having no clock.
 */

const org = { data: undefined as { timezone: string } | undefined };
vi.mock('@/features/org/use-org', () => ({ useOrg: () => org }));

// A fixed instant: 2026-09-15T05:30:00Z — 15:30 in Sydney (UTC+10, AEST).
const FIXED = new Date('2026-09-15T05:30:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED);
  org.data = { timezone: 'Australia/Sydney' };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('StationClock', () => {
  it('shows the station time and UTC, not the browser time', async () => {
    renderWithProviders(<StationClock />);
    // The effect that starts the clock runs after mount.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(screen.getByText(/15:30:00/)).toBeInTheDocument(); // Sydney
    expect(screen.getByText(/05:30 UTC/)).toBeInTheDocument(); // the same instant
  });

  it('names the zone, so the time is never ambiguous', async () => {
    renderWithProviders(<StationClock />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    // CLDR gives "AEST" in en-AU and "GMT+10" elsewhere — both name the zone,
    // and which one appears depends on the viewer's locale, not on us.
    expect(screen.getByText(/AEST|GMT\+10/)).toBeInTheDocument();
  });

  it('emits no time on the SERVER, so hydration cannot mismatch', () => {
    /**
     * The server renders at one instant and the browser at another, so emitting
     * a time during SSR guarantees a mismatch — React discards the markup and
     * warns. Asserted against real server rendering rather than against the test
     * renderer, which runs effects immediately and would never show the gap.
     */
    const html = renderToStaticMarkup(<StationClock />);
    expect(html).not.toMatch(/\d\d:\d\d/);
  });

  it('ticks', async () => {
    renderWithProviders(<StationClock />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/15:30:00/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText(/15:30:02/)).toBeInTheDocument();
  });

  it('does not print the same number twice for a UTC station', async () => {
    // Showing "10:00 UTC" under "10:00 UTC" invites the reader to hunt for a
    // difference that is not there.
    org.data = { timezone: 'UTC' };
    renderWithProviders(<StationClock />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByText(/05:30 UTC/)).toBeNull();
    expect(screen.getByText(/05:30:00/)).toBeInTheDocument();
  });

  it('falls back to UTC rather than throwing on a bad timezone', async () => {
    // The zone comes from the database; an invalid IANA name would otherwise
    // throw inside Intl on every tick and take the whole header down.
    org.data = { timezone: 'Not/AZone' };
    renderWithProviders(<StationClock />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/05:30:00/)).toBeInTheDocument();
  });

  it('still renders while the organisation is loading', async () => {
    org.data = undefined;
    renderWithProviders(<StationClock />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/05:30:00/)).toBeInTheDocument();
  });
});

describe('zoneLabel', () => {
  it('resolves the abbreviation at a given instant, because DST moves it', () => {
    // The same station is AEST in winter and AEDT in summer. A label fixed to
    // one of them is wrong by an hour for half the year.
    // Asserted on the OFFSET, which changes visibly and is locale-independent:
    // Sydney is +10 in July and +11 in January.
    const winter = zoneLabel('Australia/Sydney', new Date('2026-07-01T00:00:00Z'))!;
    const summer = zoneLabel('Australia/Sydney', new Date('2026-01-01T00:00:00Z'))!;
    expect(winter).not.toBe(summer);
    expect(winter).toMatch(/AEST|GMT\+10/);
    expect(summer).toMatch(/AEDT|GMT\+11/);
  });

  it('returns null for an unusable zone instead of throwing', () => {
    expect(zoneLabel('Not/AZone')).toBeNull();
    expect(zoneLabel(undefined)).toBeNull();
  });
});
