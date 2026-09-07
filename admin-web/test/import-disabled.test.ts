import { describe, it, expect } from 'vitest';
import { isFeatureEnabled } from '@/lib/config/flags';
import { NAV_ITEMS } from '@/components/app-shell/nav-config';

/**
 * The import wizard is switched off.
 *
 * Turned off at the FLAG rather than by commenting the files out, so the code
 * stays type-checked and built and compiles the day it is wanted back — the same
 * reason the backend disables modules at registration instead of inside files.
 *
 * Three surfaces read it: the sidebar, the command palette (⌘K searches the same
 * NAV_ITEMS and applies the same flag rule) and the route itself, which returns
 * 404 so a bookmarked `/import` cannot reach it either.
 */
describe('the import wizard is disabled', () => {
  it('has its flag off', () => {
    expect(isFeatureEnabled('importExport')).toBe(false);
  });

  it('gates the nav entry on that flag, which hides it from the sidebar AND the palette', () => {
    const item = NAV_ITEMS.find((i) => i.key === 'import');
    expect(item).toBeDefined();
    // Present but gated — not deleted. Deleting it would lose the capability and
    // label wiring that has to come back with the feature.
    expect(item!.flag).toBe('importExport');
    expect(isFeatureEnabled(item!.flag!)).toBe(false);
  });

  it('leaves every other section reachable', () => {
    // A flag flip is easy to aim at the wrong key; this catches that.
    const visible = NAV_ITEMS.filter((i) => !i.flag || isFeatureEnabled(i.flag)).map((i) => i.key);
    for (const key of ['records', 'analytics', 'alerts', 'share', 'notifications', 'settings']) {
      expect(visible).toContain(key);
    }
    expect(visible).not.toContain('import');
  });

  it('does NOT disable exports, despite the flag being named importExport', () => {
    // Share links carry the export capability and are gated on their own flag.
    const share = NAV_ITEMS.find((i) => i.key === 'share');
    expect(share?.flag).toBe('share');
    expect(isFeatureEnabled('share')).toBe(true);
  });
});
