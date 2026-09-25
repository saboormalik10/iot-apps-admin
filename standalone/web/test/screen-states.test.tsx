import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './utils';
import { EmptyState, ErrorState } from '@/components/screen-states';

describe('screen-state primitives (plan §3.5)', () => {
  it('EmptyState renders a custom title', () => {
    renderWithProviders(<EmptyState title="No people yet" body="Invite someone" />);
    expect(screen.getByText('No people yet')).toBeInTheDocument();
    expect(screen.getByText('Invite someone')).toBeInTheDocument();
  });

  it('ErrorState shows a retry button that is wired', () => {
    let clicked = false;
    renderWithProviders(<ErrorState onRetry={() => (clicked = true)} />);
    const btn = screen.getByRole('button');
    btn.click();
    expect(clicked).toBe(true);
  });
});
