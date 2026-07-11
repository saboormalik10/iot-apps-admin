import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WindRose } from '@/components/charts/wind-rose';
import { CompletenessHeatmap } from '@/features/analytics/daily-summary/completeness-heatmap';
import type { MetDailySummary } from '@/lib/api/types';

/** Minimal MetDailySummary — the daily-summary panels only read dateMs + a few fields. */
function summary(dateMs: number, completenessPercent: number): MetDailySummary {
  return { dateMs, completenessPercent, date: new Date(dateMs).toISOString().slice(0, 10) } as unknown as MetDailySummary;
}

describe('analytics charts (Month 9)', () => {
  it('WindRose renders from a pre-aggregated matrix (analytics path)', () => {
    // 16 sectors × 5 bands; 3 samples in N-Calm, 2 in E-Light → 5 total.
    const matrix = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]);
    matrix[0][0] = 3; // N, Calm band
    matrix[4][1] = 2; // E, Light band

    render(<WindRose matrix={matrix} title="Agg" />);
    // The SVG aria-label reflects the total derived from the matrix, not samples.
    expect(screen.getByRole('img', { name: /Agg: 5 samples/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show table/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('CompletenessHeatmap renders a cell per day with a completeness title', () => {
    const day = 1_700_000_000_000 - (1_700_000_000_000 % 86_400_000);
    render(<CompletenessHeatmap summaries={[summary(day, 100), summary(day + 86_400_000, 42)]} />);

    expect(screen.getByText('Data completeness')).toBeInTheDocument();
    // Each day cell carries a `${date}: ${pct}%` title.
    expect(screen.getByTitle(/: 100%$/)).toBeInTheDocument();
    expect(screen.getByTitle(/: 42%$/)).toBeInTheDocument();
  });
});
