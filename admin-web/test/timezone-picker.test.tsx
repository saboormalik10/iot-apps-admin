import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './utils';
import { TimeZonePicker, allTimeZones, offsetLabel, detectedTimeZone, zoneMatches } from '@/components/data/timezone-picker';

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

  it('is a real control, not a text box — the ZONE cannot be typed in', () => {
    const onChange = vi.fn();
    const { container } = renderWithProviders(<TimeZonePicker value="UTC" onChange={onChange} />);
    // The point of the original change: no free-text field to mistype a zone
    // into. The search box added later does not reopen that hole — it filters
    // the list and never becomes the value, and it exists only while open.
    expect(container.querySelector('input[type="text"]')).toBeNull();
    const trigger = screen.getByRole('combobox');
    fireEvent.change(trigger, { target: { value: 'Australia/Sydny' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

/**
 * The matching is tested directly rather than by driving the listbox.
 *
 * Radix portals its content and runs its own type-ahead, so a jsdom test that
 * opens the menu and types proves almost nothing about whether "syd" finds
 * Sydney. This is where the behaviour actually lives.
 */
describe('TimeZonePicker search', () => {
  const label = (tz: string) => `${tz} · ${offsetLabel(tz)}`;
  const find = (q: string) => allTimeZones().filter((tz) => zoneMatches(tz, label(tz), q));

  it('matches on the city', () => {
    expect(find('sydney')).toContain('Australia/Sydney');
  });

  it('matches on the region', () => {
    const hits = find('australia');
    expect(hits).toContain('Australia/Perth');
    expect(hits).toContain('Australia/Melbourne');
    expect(hits).not.toContain('Europe/London');
  });

  it('ignores the underscore nobody types', () => {
    // `America/New_York` — searching "new york" must find it.
    expect(find('new york')).toContain('America/New_York');
  });

  it('ignores the slash, so "asia karachi" works', () => {
    expect(find('asia karachi')).toContain('Asia/Karachi');
  });

  it('is case-insensitive', () => {
    expect(find('SYDNEY')).toContain('Australia/Sydney');
  });

  it('ANDs the terms, so a second word narrows rather than widens', () => {
    const one = find('australia');
    const two = find('australia perth');
    expect(two.length).toBeLessThan(one.length);
    expect(two).toContain('Australia/Perth');
    expect(two).not.toContain('Australia/Sydney');
  });

  it('searches the OFFSET too — a known offset is a fair way to look', () => {
    // September: Karachi is +5. The offset lives in the label, not the name.
    expect(zoneMatches('Asia/Karachi', 'Asia/Karachi · GMT+5', '+5')).toBe(true);
  });

  it('an empty or whitespace query keeps everything', () => {
    expect(find('').length).toBe(allTimeZones().length);
    expect(find('   ').length).toBe(allTimeZones().length);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(find('zzzznotazone')).toHaveLength(0);
  });
});
