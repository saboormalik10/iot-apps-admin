import { describe, it, expect } from 'vitest';
import { rangeWindow, RANGE_PRESETS } from '@/lib/hooks/use-scope';

describe('useScope range windows', () => {
  const now = 1_700_000_000_000;

  it('offers exactly the 5 documented presets', () => {
    expect(RANGE_PRESETS.map((p) => p.key)).toEqual(['1h', '24h', '7d', '30d', 'all']);
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
