import { describe, it, expect } from 'vitest';
import { NAV_ITEMS } from '@/components/app-shell/nav-config';

/**
 * The platform administrator's tools belong in one place.
 *
 * "All customers" used to sit between Audit log and Stream types with nothing to
 * mark it as platform-wide, and the cross-customer stream-types view looked
 * identical to the customer's own screen while showing every tenant's stations.
 * Which tenant you were administering was left to be inferred.
 */

/** Reproduces the filter in sidebar.tsx and command-palette.tsx. */
const visibleTo = (isSuperAdmin: boolean) =>
  NAV_ITEMS.filter(
    (i) => !(i.superAdminOnly && !isSuperAdmin) && !(i.hideForSuperAdmin && isSuperAdmin),
  ).map((i) => i.key);

describe('admin navigation', () => {
  it('gives the administrator a single Admin controls entry', () => {
    const admin = NAV_ITEMS.find((i) => i.key === 'admin');
    expect(admin?.href).toBe('/admin');
    expect(admin?.superAdminOnly).toBe(true);
  });

  it('no longer offers the old All customers entry separately', () => {
    expect(NAV_ITEMS.find((i) => i.key === 'platform')).toBeUndefined();
  });

  it('does not show an administrator two entries for stream types', () => {
    // Theirs is a tab inside Admin controls; the nav item is the customer's.
    expect(visibleTo(true)).not.toContain('streamTypes');
    expect(visibleTo(true)).toContain('admin');
  });

  it('leaves the customer their own Stream types, and no admin entry', () => {
    expect(visibleTo(false)).toContain('streamTypes');
    expect(visibleTo(false)).not.toContain('admin');
  });

  it('never marks an item both super-admin-only and hidden from them', () => {
    // That combination is invisible to everyone — a dead entry with nothing
    // to say so.
    const contradictory = NAV_ITEMS.filter((i) => i.superAdminOnly && i.hideForSuperAdmin);
    expect(contradictory).toEqual([]);
  });

  it('shows every non-admin screen to both, so nothing was lost in the move', () => {
    const shared = NAV_ITEMS.filter((i) => !i.superAdminOnly && !i.hideForSuperAdmin).map((i) => i.key);
    for (const key of shared) {
      expect(visibleTo(true)).toContain(key);
      expect(visibleTo(false)).toContain(key);
    }
  });
});
