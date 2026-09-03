import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './utils';
import { KpiRow } from '@/features/dashboard/kpi-row';

// KpiRow → useSummary → useScope reads the URL via next/navigation.
vi.mock('next/navigation', () => {
  const searchParams = new URLSearchParams();
  return {
    useRouter: () => ({ replace: () => {}, push: () => {} }),
    usePathname: () => '/',
    useSearchParams: () => searchParams,
  };
});

describe('KpiRow (§10.8 summary enrichment)', () => {
  it('renders the KPI numbers and the sparklines', async () => {
    renderWithProviders(<KpiRow />);

    // Headline counts from the mocked /dashboard/summary.
    await waitFor(() => expect(screen.getByText('Devices')).toBeInTheDocument());
    // READINGS, not records. The old tile counted MetRecord documents, which are
    // one per station per LOCAL DAY — so it showed a day count that moved once a
    // day and looked frozen.
    expect(screen.getByText('MET readings')).toBeInTheDocument();
    expect(screen.queryByText('MET records')).toBeNull();

    // §10.8 sparkline renders as an SVG on the readings tile.
    await waitFor(() => expect(document.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1));
  });

  // NEP is disabled (M15 W4), so both tiles could only ever show 0 — and a
  // permanent zero reads as a fault rather than an absent feature.
  it('omits the NEP tiles while NEP is disabled', async () => {
    renderWithProviders(<KpiRow />);

    await waitFor(() => expect(screen.getByText('Devices')).toBeInTheDocument());
    expect(screen.queryByText('NEP sessions')).toBeNull();
    expect(screen.queryByText('MET / NEP')).toBeNull();
  });

  // Alerts are switched off: nothing evaluates rules, so an "armed" count would
  // be misleading and the /alerts route it linked to no longer exists.
  it('omits the armed-alerts tile while alerts are disabled', async () => {
    renderWithProviders(<KpiRow />);

    await waitFor(() => expect(screen.getByText('Devices')).toBeInTheDocument());
    expect(screen.queryByText('Armed alerts')).toBeNull();
    expect(screen.queryByRole('link', { name: /armed alerts/i })).toBeNull();
  });
});
