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
  it('renders the KPI numbers, the armed-alerts tile, and the sparklines', async () => {
    renderWithProviders(<KpiRow />);

    // Headline counts from the mocked /dashboard/summary.
    await waitFor(() => expect(screen.getByText('Armed alerts')).toBeInTheDocument());
    expect(screen.getByText('Devices')).toBeInTheDocument();
    expect(screen.getByText('MET records')).toBeInTheDocument();
    expect(screen.getByText('NEP sessions')).toBeInTheDocument();

    // The armed-alerts tile deep-links to /alerts.
    const alertsLink = screen.getByRole('link', { name: /armed alerts/i });
    expect(alertsLink).toHaveAttribute('href', '/alerts');

    // §10.8 sparklines render as SVGs on the records/sessions tiles.
    await waitFor(() => expect(document.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2));
  });
});
