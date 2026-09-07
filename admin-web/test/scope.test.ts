import { describe, it, expect } from 'vitest';
import { rangeWindow, RANGE_PRESETS } from '@/lib/hooks/use-scope';

describe('useScope range windows', () => {
  const now = 1_700_000_000_000;

  it('offers the documented presets, in both families', () => {
    // Pinned so a preset is never added or dropped by accident. The catalogue
    // now carries two kinds: rolling windows ending NOW, and calendar days
    // resolved against the VIEWER's midnight — see range-window.test.ts, which
    // proves the calendar ones follow the viewer's timezone.
    expect(RANGE_PRESETS.filter((p) => p.kind === 'rolling').map((p) => p.key)).toEqual([
      '1h',
      '24h',
      '7d',
      '30d',
      'all',
    ]);
    expect(RANGE_PRESETS.filter((p) => p.kind === 'day').map((p) => p.key)).toEqual([
      'today',
      'yesterday',
      'last7days',
    ]);
  });

  it('computes bounded windows for time presets', () => {
    expect(rangeWindow('1h', now)).toEqual({ from: now - 3_600_000, to: now });
    expect(rangeWindow('24h', now)).toEqual({ from: now - 86_400_000, to: now });
    expect(rangeWindow('7d', now)).toEqual({ from: now - 7 * 86_400_000, to: now });
  });

  it('leaves the lower bound open for "all"', () => {
    const w = rangeWindow('all', now);
    expect(w.from).toBeUndefined();
    expect(w.to).toBe(now);
  });
});
