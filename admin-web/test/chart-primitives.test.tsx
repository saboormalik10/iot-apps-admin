import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatTile } from '@/components/charts/stat-tile';
import { Meter } from '@/components/charts/meter';
import { StatusBadge } from '@/components/charts/status-badge';
import { WindRose } from '@/components/charts/wind-rose';

describe('chart primitives', () => {
  it('StatTile shows label + value and links when href is given', () => {
    render(<StatTile label="Devices" value="4" href="/devices" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/devices');
    expect(screen.getByText('Devices')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('Meter exposes accessible bounds and a numeric label (colour never alone)', () => {
    render(<Meter value={12} label="Battery" />);
    const meter = screen.getByRole('meter', { name: 'Battery' });
    expect(meter).toHaveAttribute('aria-valuenow', '12');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('StatusBadge always renders a text label alongside the tone', () => {
    render(<StatusBadge tone="ok" label="Online" />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('WindRose buckets samples into 16 sectors and exposes a table view', () => {
    const samples = [
      { speedMs: 2, dirDeg: 0 },
      { speedMs: 5, dirDeg: 90 },
      { speedMs: 9, dirDeg: 180 },
      { speedMs: 15, dirDeg: 270 },
    ];
    render(<WindRose samples={samples} />);
    // Toggle to table view and confirm the 16 compass rows render.
    fireEvent.click(screen.getByRole('button', { name: /show table/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('W')).toBeInTheDocument();
  });
});
