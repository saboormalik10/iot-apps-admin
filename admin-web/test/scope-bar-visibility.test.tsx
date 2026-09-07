import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './utils';

/**
 * The scope bar must appear ONLY where something reads it.
 *
 * It was drawn on seven routes that never call `useScope`, so "All types / All
 * devices / Last hour" wrote to the URL and changed nothing on screen. A filter
 * row that visibly does nothing reads as broken, which is how it was reported.
 *
 * The list pages stay scoped; only the pinned detail pages lose the bar.
 */
let pathname = '/';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const { ScopeBar } = await import('@/components/scope/scope-bar');

const renderAt = (p: string) => {
  pathname = p;
  const r = renderWithProviders(<ScopeBar />);
  return r;
};

const SHOWN = ['/', '/records', '/devices', '/map'];
const HIDDEN = [
  '/records/6a9ec3e3b5843053171704f3', // the reported page
  '/devices/6a8bfc4c6653f87fc268da81',
  '/fleet',
  '/alerts',
  '/notifications',
  '/share',
  '/users',
  '/settings',
  '/analytics',
];

describe('scope bar visibility', () => {
  it.each(SHOWN)('renders on %s, which is scoped', (p) => {
    const { unmount } = renderAt(p);
    expect(screen.queryByText('Scope')).toBeInTheDocument();
    unmount();
  });

  it.each(HIDDEN)('is hidden on %s, where nothing reads it', (p) => {
    const { unmount } = renderAt(p);
    expect(screen.queryByText('Scope')).toBeNull();
    unmount();
  });

  /**
   * Stations lists current state — status, last seen, battery — so a range
   * control there wrote to the URL and changed nothing. The rest of the bar
   * stays, because type and device genuinely filter that page.
   */
  it('drops only the RANGE on Stations, keeping the filters that work', () => {
    const { unmount } = renderAt('/devices');
    expect(screen.queryByText('Scope')).toBeInTheDocument();
    expect(screen.queryByLabelText('Device type')).toBeInTheDocument();
    expect(screen.queryByLabelText('Date range')).toBeNull();
    unmount();
  });

  it('keeps the range where something reads it', () => {
    for (const p of ['/', '/records']) {
      const { unmount } = renderAt(p);
      expect(screen.queryByLabelText('Date range')).toBeInTheDocument();
      unmount();
    }
  });

  it('keeps the LIST scoped even though its detail page is not', () => {
    const a = renderAt('/records');
    expect(screen.queryByText('Scope')).toBeInTheDocument();
    a.unmount();
    const b = renderAt('/records/abc123');
    expect(screen.queryByText('Scope')).toBeNull();
    b.unmount();
  });
});
