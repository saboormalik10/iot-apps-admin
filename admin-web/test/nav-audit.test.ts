import { describe, it, expect } from 'vitest';
import { NAV_ITEMS } from '@/components/app-shell/nav-config';

/**
 * The audit log needs a way in.
 *
 * It was the third tab of the Organization page. That page was retired from the
 * nav when user management moved to /users and org settings to /settings — but
 * the audit tab moved nowhere, so the only route to it was typing
 * `/org?tab=audit`. A record of who did what is worth nothing if nobody can
 * find it, and nothing failed loudly enough to notice.
 */
describe('audit log navigation', () => {
  const audit = NAV_ITEMS.find((i) => i.key === 'audit');

  it('is in the nav at all', () => {
    expect(audit).toBeDefined();
    expect(audit?.href).toBe('/audit');
  });

  it('is admin-only, matching the API', () => {
    // The endpoint requires the `admin` role AND `audit:read`: the log shows
    // every user's activity, sign-ins included.
    expect(audit?.capability).toBe('manageOrg');
  });

  it('is not hidden behind a feature flag that could switch it off', () => {
    expect(audit?.flag).toBeUndefined();
  });

  it('every nav entry points somewhere distinct', () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
