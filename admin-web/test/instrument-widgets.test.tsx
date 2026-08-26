import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Gauge } from '@/components/charts/gauge';
import { Thermometer } from '@/components/charts/thermometer';
import { BatteryGauge } from '@/components/charts/battery-gauge';
import { CompassTile } from '@/components/charts/compass-tile';

/**
 * The instrument widgets (gap-analysis §4) all share the same a11y contract as the
 * existing Meter: role="meter" with aria-valuenow/min/max, plus a VISIBLE numeric
 * value + unit (colour is never the only signal, §7), and an en-dash — never a
 * fabricated 0 — for a null reading (§10.2).
 */
describe('instrument widgets — meter a11y contract', () => {
  it('Gauge exposes role=meter with the value + range and shows value/unit', () => {
    render(<Gauge value={1.7} min={0} max={100} label="Wind speed" unit="km/h" />);
    const meter = screen.getByRole('meter', { name: 'Wind speed' });
    expect(meter).toHaveAttribute('aria-valuenow', '1.7');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('1.7')).toBeInTheDocument();
    expect(screen.getAllByText('km/h').length).toBeGreaterThan(0);
  });

  it('Gauge drops the meter role entirely for a null reading', () => {
    // It used to keep role="meter" with no aria-valuenow — which axe flags as a
    // CRITICAL aria-required-attr violation, and this test previously asserted
    // that broken shape. With nothing to report it is not a meter; it degrades to
    // an image carrying the same accessible name.
    render(<Gauge value={null} min={0} max={100} label="Humidity" unit="%" />);
    expect(screen.queryByRole('meter')).toBeNull();
    const meter = screen.getByRole('img', { name: 'Humidity' });
    expect(meter).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('Thermometer exposes role=meter and the temperature value', () => {
    render(<Thermometer value={19.1} min={-10} max={50} label="Temperature" />);
    const meter = screen.getByRole('meter', { name: 'Temperature' });
    expect(meter).toHaveAttribute('aria-valuenow', '19.1');
    expect(screen.getByText('19.1')).toBeInTheDocument();
  });

  it('Thermometer shows an en-dash and drops the meter role for a null reading', () => {
    render(<Thermometer value={null} label="Dew point" />);
    expect(screen.queryByRole('meter')).toBeNull();
    const meter = screen.getByRole('img', { name: 'Dew point' });
    expect(meter).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('BatteryGauge maps voltage to a charge % and exposes role=meter', () => {
    // 13 V on a 10–15 V range → 60% charge.
    render(<BatteryGauge value={13} min={10} max={15} label="DC voltage" />);
    const meter = screen.getByRole('meter', { name: 'DC voltage' });
    expect(meter).toHaveAttribute('aria-valuenow', '13');
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('60% charge')).toBeInTheDocument();
  });

  it('CompassTile labels the bearing + 16-point sector and handles null', () => {
    const { rerender } = render(<CompassTile deg={195} label="Wind direction" />);
    expect(screen.getByRole('img', { name: /195 degrees, SSW/i })).toBeInTheDocument();
    expect(screen.getByText('195°')).toBeInTheDocument();

    rerender(<CompassTile deg={null} label="Wind direction" />);
    expect(screen.getByRole('img', { name: /no data/i })).toBeInTheDocument();
  });
});
