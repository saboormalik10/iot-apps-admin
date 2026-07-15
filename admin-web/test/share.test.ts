import { describe, it, expect } from 'vitest';
import { publicShareUrl } from '@/features/share/share-url';

describe('publicShareUrl (panel builds its own /s link, not the backend url)', () => {
  it('builds a /s/<token> URL on the current origin', () => {
    expect(publicShareUrl('shr_abc123')).toBe(`${window.location.origin}/s/shr_abc123`);
  });

  it('keeps the token verbatim in the path', () => {
    expect(publicShareUrl('shr_XyZ')).toMatch(/\/s\/shr_XyZ$/);
  });
});
