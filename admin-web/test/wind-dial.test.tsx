import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { WindDial } from '@/components/charts/wind-dial';

/**
 * WindDial (M16 W1).
 *
 * The behaviours pinned here are the ones that would be wrong-but-plausible if
 * unchecked — a fabricated bearing, a missing calibration caption, colour as the
 * only signal.
 */

describe('WindDial', () => {
  it('shows the speed as the hero number with its unit', () => {
    render(<WindDial speedMs={1.0} speedKmh={3.6} dirDeg={120} />);
    expect(screen.getByText('3.60')).toBeInTheDocument();
    expect(screen.getByText('km/h')).toBeInTheDocument();
  });

  it('shows the bearing and its 16-point sector', () => {
    render(<WindDial speedMs={1.0} speedKmh={3.6} dirDeg={120} />);
    expect(screen.getByText('120° ESE')).toBeInTheDocument();
  });

  it('exposes the meter a11y contract the other instruments use', () => {
    render(<WindDial speedMs={1.0} speedKmh={3.6} dirDeg={120} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '3.6');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter.getAttribute('aria-label')).toMatch(/3\.60 kilometres per hour/);
    expect(meter.getAttribute('aria-label')).toMatch(/bearing 120 degrees ESE/);
  });

  it('renders NO bearing when the reading is calm, never a fabricated 0°', () => {
    // 31% of the station's real rows are below the sensor's 0.16 km/h bearing
    // threshold and carry no direction. Zero would read as a confident "due north"
    // and put a false spike on every downstream chart.
    render(<WindDial speedMs={0.02} speedKmh={0.07} dirDeg={null} />);
    expect(screen.getByText('No bearing')).toBeInTheDocument();
    expect(screen.queryByText(/0° N\b/)).not.toBeInTheDocument();
    // The speed is still reported — only the bearing is missing.
    expect(screen.getByText('0.07')).toBeInTheDocument();
  });

  it('omits the needle entirely when there is no bearing', () => {
    const { container } = render(<WindDial speedMs={0.02} speedKmh={0.07} dirDeg={null} />);
    expect(container.querySelector('polygon')).toBeNull();
  });

  it('draws the needle when there is a bearing', () => {
    const { container } = render(<WindDial speedMs={1.0} speedKmh={3.6} dirDeg={120} />);
    const needle = container.querySelector('polygon');
    expect(needle).not.toBeNull();
    expect(container.querySelector('g[transform*="rotate(120"]')).not.toBeNull();
  });

  it('renders an en-dash for a null speed rather than 0', () => {
    render(<WindDial speedMs={null} speedKmh={null} dirDeg={null} />);
    expect(screen.getByText('–')).toBeInTheDocument();
    // Not a meter with no value to report — that is a CRITICAL axe violation
    // (aria-required-attr). It degrades to an image with the same name.
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/no data/);
  });

  it('says the bearing is relative while the mast is uncalibrated', () => {
    render(<WindDial speedMs={1.0} speedKmh={3.6} dirDeg={120} headingOffsetDeg={0} />);
    expect(screen.getByText(/Relative to mast · uncalibrated/)).toBeInTheDocument();
    expect(screen.getByRole('meter').getAttribute('aria-label')).toMatch(/relative to the mast/);
  });

  it('drops the caption once a heading offset is set', () => {
    render(<WindDial speedMs={1.0} speedKmh={3.6} dirDeg={120} headingOffsetDeg={12} />);
    expect(screen.queryByText(/uncalibrated/)).not.toBeInTheDocument();
  });

  it('names the speed band and Beaufort force, so colour is never the only signal', () => {
    render(<WindDial speedMs={1.0} speedKmh={3.6} dirDeg={120} />);
    // 1.0 m/s → "Light" band, Beaufort 1.
    expect(screen.getByText(/Light/)).toBeInTheDocument();
    expect(screen.getByText(/Beaufort/)).toBeInTheDocument();
  });

  it('wraps the bearing into 0–359', () => {
    render(<WindDial speedMs={1.0} speedKmh={3.6} dirDeg={370} />);
    expect(screen.getByText('10° N')).toBeInTheDocument();
  });

  it('handles a negative bearing without producing a negative angle', () => {
    render(<WindDial speedMs={1.0} speedKmh={3.6} dirDeg={-90} />);
    expect(screen.getByText('270° W')).toBeInTheDocument();
  });
});
