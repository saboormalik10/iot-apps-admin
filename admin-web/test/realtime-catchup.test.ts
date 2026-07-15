import { describe, it, expect } from 'vitest';
import { LIVE_QUERY_ROOTS } from '@/lib/realtime/live-query-roots';

const flat = LIVE_QUERY_ROOTS.map((r) => r[0]);

describe('realtime catch-up scope (§Month 11 hardening)', () => {
  it('covers every live surface, including the Month-11 additions', () => {
    for (const root of [
      'dashboard',
      'analytics',
      'sessions',
      'records',
      'devices',
      'alert-rules',
      'notifications',
      'share',
    ]) {
      expect(flat).toContain(root);
    }
  });

  it('excludes static roots so a reconnect no longer nukes the whole cache', () => {
    for (const root of ['audit', 'org', 'profile', 'users']) {
      expect(flat).not.toContain(root);
    }
  });

  it('every root is a non-empty key prefix', () => {
    expect(LIVE_QUERY_ROOTS.every((r) => Array.isArray(r) && r.length >= 1 && r[0])).toBe(true);
  });
});
