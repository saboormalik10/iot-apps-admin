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
    expect(screen.getByText('MET records')).toBeInTheDocument();
    expect(screen.getByText('NEP sessions')).toBeInTheDocument();

    // §10.8 sparklines render as SVGs on the records/sessions tiles.
    await waitFor(() => expect(document.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2));
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
