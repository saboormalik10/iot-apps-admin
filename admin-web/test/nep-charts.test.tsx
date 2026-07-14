import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Histogram, type HistogramBar } from '@/components/charts/histogram';
import { StackedBar, type StackSeries } from '@/components/charts/stacked-bar';
import { ScatterChart } from '@/components/charts/scatter-chart';
import { RangeBandChart, type RangeBandRow } from '@/components/charts/range-band-chart';
import { CalendarHeatmap, type CalendarCell } from '@/components/charts/calendar-heatmap';
import { ntuHex, NTU_LEGEND, NTU_BLUE_RAMP } from '@/lib/api/map-colors';

const DAY = 86_400_000;
const day0 = 1_700_000_000_000 - (1_700_000_000_000 % DAY);

describe('Month 10 chart primitives', () => {
  it('Histogram exposes a table view with class labels and counts', () => {
    const bars: HistogramBar[] = [
      { label: '0–1', value: 5, role: 'status-ok', meta: 'WHO drinking compliant' },
      { label: '1–10', value: 3, role: 'seq-1', meta: 'EPA recreational safe' },
    ];
    render(<Histogram bars={bars} title="Turbidity" valueLabel="Samples" />);
    fireEvent.click(screen.getByRole('button', { name: /show table/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('0–1')).toBeInTheDocument();
    expect(screen.getByText('WHO drinking compliant')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('StackedBar renders every series in its table view', () => {
    const series: StackSeries[] = [
      { key: 'r1', label: 'R1', role: 'seq-2' },
      { key: 'r2', label: 'R2', role: 'seq-4' },
      { key: 'r3', label: 'R3', role: 'seq-5' },
    ];
    render(<StackedBar data={[{ date: '2026-07-01', r1: 7, r2: 2, r3: 0 }]} xKey="date" series={series} title="Probe mix" />);
    fireEvent.click(screen.getByRole('button', { name: /show table/i }));
    expect(screen.getByText('R1')).toBeInTheDocument();
    expect(screen.getByText('R2')).toBeInTheDocument();
    expect(screen.getByText('R3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('ScatterChart shows its annotation and a table of paired points', () => {
    render(
      <ScatterChart
        points={[{ x: 10, y: 100 }, { x: 12, y: 80 }]}
        xLabel="Temperature"
        yLabel="Turbidity"
        xUnit="°C"
        yUnit="NTU"
        annotation={<span>r = 0.42</span>}
      />,
    );
    // The annotation lives in the frame chrome, visible regardless of view.
    expect(screen.getByText('r = 0.42')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show table/i }));
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });

  it('RangeBandChart tables out min / mean / max per row', () => {
    const rows: RangeBandRow[] = [{ label: 'Mon', min: 1, max: 9, mean: 4 }];
    render(<RangeBandChart rows={rows} title="Turbidity" unit="NTU" />);
    fireEvent.click(screen.getByRole('button', { name: /show table/i }));
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('CalendarHeatmap titles cells with a formatted value and flags in-range gaps', () => {
    // Skip a day (day0+DAY) so it is an in-range gap.
    const cells: CalendarCell[] = [
      { dateMs: day0, value: 100 },
      { dateMs: day0 + 2 * DAY, value: 40 },
    ];
    render(<CalendarHeatmap cells={cells} title="Sampling activity" formatValue={(v) => `${v} samples`} />);
    expect(screen.getByText('Sampling activity')).toBeInTheDocument();
    expect(screen.getByTitle(/: 100 samples$/)).toBeInTheDocument();
    expect(screen.getByTitle(/: 40 samples$/)).toBeInTheDocument();
    expect(screen.getByTitle(/: no data$/)).toBeInTheDocument();
  });
});

describe('map colours (turbidity, GL-layer only)', () => {
  it('maps turbidity onto the 7-stop WHO/EPA blue ramp by class', () => {
    expect(NTU_LEGEND).toHaveLength(7);
    expect(NTU_BLUE_RAMP).toHaveLength(7);
    expect(ntuHex(0.5)).toBe(NTU_BLUE_RAMP[0]); // WHO drinking compliant
    expect(ntuHex(5)).toBe(NTU_BLUE_RAMP[1]); // EPA recreational
    expect(ntuHex(5000)).toBe(NTU_BLUE_RAMP[6]); // extreme / flood
  });

  it('renders a neutral gray for a missing reading (never plotted as 0)', () => {
    expect(ntuHex(null)).toBe('#9ca3af');
    expect(ntuHex(undefined)).toBe('#9ca3af');
  });
});
