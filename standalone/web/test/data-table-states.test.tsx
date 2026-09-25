import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { renderWithProviders } from './utils';
import { DataTable } from '@/components/data/data-table';

/**
 * A failed request and an empty organisation used to render the SAME screen:
 * `DataTable` had no error path, so "the server returned a 500" was displayed as
 * "No results." That is a confident, wrong claim about a customer's data, and it
 * is worst right after a platform administrator switches customer — where an
 * empty list reads as "this customer owns nothing".
 *
 * Precedence is the load-bearing property, not the mere existence of an error
 * state: a failed REFETCH leaves `isLoading` false and the rows empty, so any
 * order that checks loading or emptiness first falls straight back into the lie.
 */

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [{ header: 'Name', accessorKey: 'name' }];
const rows: Row[] = [{ id: '1', name: 'Rooftop station' }];

describe('DataTable loading / empty / error states', () => {
  it('shows the empty label when the request genuinely returned no rows', () => {
    renderWithProviders(<DataTable data={[]} columns={columns} emptyLabel="No stations." />);
    expect(screen.getByText('No stations.')).toBeInTheDocument();
  });

  it('shows an error state — NOT the empty label — when the request failed', () => {
    renderWithProviders(
      <DataTable data={[]} columns={columns} emptyLabel="No stations." error={new Error('boom')} />,
    );
    expect(screen.queryByText('No stations.')).not.toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('prefers the error state over the loading skeleton', () => {
    // The failed-refetch shape: settled (so not loading), no rows, and an error.
    // Checking `isLoading` first would render a skeleton forever.
    const { container } = renderWithProviders(
      <DataTable data={[]} columns={columns} isLoading error={new Error('boom')} />,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(container.querySelectorAll('table')).toHaveLength(0);
  });

  it('wires retry back to the caller', () => {
    let retried = 0;
    renderWithProviders(
      <DataTable data={[]} columns={columns} error={new Error('boom')} onRetry={() => (retried += 1)} />,
    );
    screen.getByRole('button', { name: /retry|try again/i }).click();
    expect(retried).toBe(1);
  });

  it('renders rows normally when there is no error', () => {
    renderWithProviders(<DataTable data={rows} columns={columns} />);
    expect(screen.getByText('Rooftop station')).toBeInTheDocument();
  });

  it('marks kept-previous rows as stale rather than passing them off as current', () => {
    // `keepPreviousData` is right for paging and wrong across a device change,
    // where it shows one station's rows under another station's filter.
    const { container } = renderWithProviders(<DataTable data={rows} columns={columns} isStale />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('Rooftop station')).toBeInTheDocument();
  });

  it('does not mark rows stale by default', () => {
    const { container } = renderWithProviders(<DataTable data={rows} columns={columns} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
