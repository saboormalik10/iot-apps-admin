import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from './utils';
import type { AlertTimeline, AlertTimelineBucket } from '@/lib/api/types';

/**
 * A minute that has not arrived yet is not a minute the station missed.
 *
 * The station writes one file per minute and uploads it only once complete, so
 * the newest minutes in a live window are routinely empty. Labelling those "No
 * readings" reports a fault that is not there — the operator's own complaint
 * that started this.
 *
 * Rendered from a FIXTURE rather than the live station: whether a real pending
 * minute exists depends on upload timing, so an end-to-end assertion on it would
 * pass or fail with the clock.
 */
const bucket = (over: Partial<AlertTimelineBucket>): AlertTimelineBucket => ({
  ts: 0,
  count: 60,
  value: 0.3,
  displayValue: 1.08,
  displayAvg: 0.8,
  breached: false,
  fired: false,
  reason: 'not_crossed',
  ...over,
});

const MIN = 60_000;
const BASE = Date.UTC(2026, 8, 7, 18, 0, 0);

const timeline: AlertTimeline = {
  ruleId: 'r1',
  deviceId: 'd1',
  name: 'New rule',
  sensor: 'wind_speed',
  condition: 'gt',
  threshold: 3,
  unit: 'km/h',
  storedUnit: 'm/s',
  thresholdStored: 0.833,
  cooldownMinutes: 5,
  isActive: true,
  from: BASE,
  to: BASE + 4 * MIN,
  minutes: 4,
  supported: true,
  historyComplete: true,
  firesOnIngestTime: 0,
  buckets: [
    bucket({ ts: BASE }),
    bucket({ ts: BASE + MIN }),
    // Genuinely absent — its file is no longer expected.
    bucket({ ts: BASE + 2 * MIN, count: 0, value: null, displayValue: null, displayAvg: null, reason: 'no_data' }),
    // Just happened — still on its way.
    bucket({ ts: BASE + 3 * MIN, count: 0, value: null, displayValue: null, displayAvg: null, reason: 'pending' }),
  ],
};

vi.mock('@/features/alerts/use-alerts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/alerts/use-alerts')>()),
  useAlertTimeline: () => ({ data: timeline, isLoading: false, isError: false, refetch: () => {} }),
}));

const { RuleTimeline } = await import('@/features/alerts/rule-timeline');

describe('the timeline separates "not yet" from "never"', () => {
  it('labels the newest empty minute as waiting, and the older one as missing', async () => {
    renderWithProviders(<RuleTimeline ruleId="r1" minutes={4} />);

    const rows = screen.getAllByRole('row').slice(1); // drop the header
    // Newest first.
    expect(within(rows[0]).getByText('Waiting for data')).toBeInTheDocument();
    expect(within(rows[1]).getByText('No readings')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Below threshold')).toBeInTheDocument();
  });

  it('never calls a pending minute "No readings"', async () => {
    renderWithProviders(<RuleTimeline ruleId="r1" minutes={4} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).queryByText('No readings')).toBeNull();
  });

  it('keeps pending minutes out of the coverage figure', async () => {
    renderWithProviders(<RuleTimeline ruleId="r1" minutes={4} />);
    // Two minutes had readings, of the three that have settled; the fourth is
    // still arriving and is NOT counted against the station.
    expect(screen.getByText(/2 of 3 minutes had readings, 1 still arriving/)).toBeInTheDocument();
  });

  it('carries the meaning in TEXT, so removing the animation loses nothing', async () => {
    // The pulse is neutralised under prefers-reduced-motion, so the row must not
    // depend on it — nor on colour alone.
    renderWithProviders(<RuleTimeline ruleId="r1" minutes={4} />);
    expect(screen.getAllByText('Waiting for data').length).toBeGreaterThan(0);
  });
});
