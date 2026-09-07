import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './utils';
import { TimeZonePicker, allTimeZones, offsetLabel, detectedTimeZone } from '@/components/data/timezone-picker';

/**
 * A customer's timezone decides where their DAYS are cut, and that boundary is
 * written into every record at ingest. The field used to be free text, where a
 * typo does not fail loudly — ingest falls back to UTC — so the days would be cut
 * on the wrong boundary and only look wrong much later.
 */
describe('TimeZonePicker', () => {
  it('offers the whole tz database, not a hand-written list', () => {
    const zones = allTimeZones();
    // The engine ships ~400; a hardcoded list would be a fraction of that and
    // would rot as zones are added and renamed.
    expect(zones.length).toBeGreaterThan(300);
    for (const tz of ['UTC', 'Australia/Sydney', 'Asia/Karachi', 'America/New_York']) {
      expect(zones).toContain(tz);
    }
  });

  it('labels each zone with its CURRENT offset, so DST is reflected', () => {
    // September: Sydney is on standard time (+10), London on summer time (+1).
    expect(offsetLabel('Australia/Sydney', new Date(Date.UTC(2026, 8, 8)))).toBe('GMT+10');
    // January: Sydney has moved to daylight time (+11).
    expect(offsetLabel('Australia/Sydney', new Date(Date.UTC(2026, 0, 8)))).toBe('GMT+11');
    expect(offsetLabel('UTC', new Date())).toMatch(/GMT/);
  });

  it('degrades to a name rather than throwing on a bad zone', () => {
    expect(offsetLabel('Australia/Sydny')).toBe('');
  });

  it('knows the viewer’s own zone', () => {
    expect(detectedTimeZone()).toBeTruthy();
  });

  it('renders the current value with its offset', () => {
    renderWithProviders(<TimeZonePicker value="Australia/Sydney" onChange={() => {}} />);
    expect(screen.getByText(/Australia\/Sydney/)).toBeInTheDocument();
  });

  it('prompts rather than showing a blank when nothing is set', () => {
    renderWithProviders(<TimeZonePicker value="" onChange={() => {}} />);
    expect(screen.getByText('Select a timezone')).toBeInTheDocument();
  });

  it('is a real control, not a text box — nothing can be typed into it', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<TimeZonePicker value="UTC" onChange={onChange} />);
    // The whole point of the change: no free-text input to mistype.
    expect(container.querySelector('input[type="text"]')).toBeNull();
    const trigger = screen.getByRole('combobox');
    fireEvent.change(trigger, { target: { value: 'Australia/Sydny' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
