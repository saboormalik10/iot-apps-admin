import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from './utils';

/**
 * A page number only means something relative to a filter.
 *
 * Records paginates locally but filters through the URL-backed Scope Bar, and
 * `page` was never reset when that scope changed. Change the station or the date
 * range while on page 3 and the request asks for page 3 of a result set that may
 * now have one page: it succeeds, returns nothing, and the table reads
 * "No results." — which is exactly the "filters not working" report.
 *
 * `keepPreviousData` makes it worse: the PREVIOUS station's rows stay on screen
 * until the empty page lands.
 */

let params = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/records',
  useSearchParams: () => params,
}));

const { useScopedPage } = await import('@/lib/hooks/use-scoped-page');

/** Records every page value the hook has returned across renders. */
function harness() {
  const seen: number[] = [];
  let setPage: (p: number) => void = () => {};

  function Probe() {
    const [page, set] = useScopedPage();
    seen.push(page);
    setPage = set;
    return null;
  }

  return { seen, Probe, setPage: (p: number) => act(() => setPage(p)) };
}

const setScope = (search: string) => {
  params = new URLSearchParams(search);
};

beforeEach(() => {
  setScope('');
});

describe('useScopedPage', () => {
  it('starts on page 1', () => {
    const h = harness();
    renderWithProviders(<h.Probe />);
    expect(h.seen.at(-1)).toBe(1);
  });

  it('keeps the page while the scope is unchanged', () => {
    const h = harness();
    const { rerender } = renderWithProviders(<h.Probe />);
    h.setPage(3);
    expect(h.seen.at(-1)).toBe(3);

    rerender(<h.Probe />);
    expect(h.seen.at(-1)).toBe(3);
  });

  it('returns to page 1 when the DEVICE changes', () => {
    const h = harness();
    const { rerender } = renderWithProviders(<h.Probe />);
    h.setPage(3);
    expect(h.seen.at(-1)).toBe(3);

    setScope('device=station-b');
    act(() => rerender(<h.Probe />));
    expect(h.seen.at(-1)).toBe(1);
  });

  it('returns to page 1 when the RANGE changes', () => {
    const h = harness();
    const { rerender } = renderWithProviders(<h.Probe />);
    h.setPage(4);

    setScope('range=7d');
    act(() => rerender(<h.Probe />));
    expect(h.seen.at(-1)).toBe(1);
  });

  it('never hands out the stale page number, not even for one render', () => {
    // The point of adjusting state during render rather than in an effect: an
    // effect would render page 3 once, fire a request for a page that does not
    // exist, and only then reset.
    const h = harness();
    const { rerender } = renderWithProviders(<h.Probe />);
    h.setPage(3);
    const before = h.seen.length;

    setScope('device=station-b');
    act(() => rerender(<h.Probe />));

    expect(h.seen.slice(before)).not.toContain(3);
    expect(h.seen.at(-1)).toBe(1);
  });

  it('does not reset on a re-render that only changes an unrelated param', () => {
    const h = harness();
    const { rerender } = renderWithProviders(<h.Probe />);
    h.setPage(2);

    setScope('demo=1');
    act(() => rerender(<h.Probe />));
    expect(h.seen.at(-1)).toBe(2);
  });
});
