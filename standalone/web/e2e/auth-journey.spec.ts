import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The Month-7 acceptance journey (plan Verification §3). Runs in the CI E2E job
 * against the seeded backend. Signs in as the seeded admin, lands on the shell,
 * opens Organization → People, and confirms the audit tab loads.
 */
const ADMIN_EMAIL = 'admin@observator.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';

/**
 * The sign-in page is the ONLY screen an unauthenticated visitor ever sees, and
 * it was the one route with no axe gate — every other journey spec checks a page
 * behind the login (M24 W2).
 */
test('the sign-in page has no accessibility violations', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('admin signs in, reaches the shell, and opens the org module', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Lands on the authenticated shell — the live dashboard home (Month 8).
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /fleet status/i })).toBeVisible();

  // Navigate to Organization → People. `/org` was retired from the nav in Month 9
  // (people moved to /users), but the route still owns org settings + the audit
  // log, so this journey navigates to it directly rather than via a dead link.
  await page.goto('/org');
  await expect(page).toHaveURL(/\/org/);
  await page.getByRole('tab', { name: /people/i }).click();
  await expect(page.getByText(ADMIN_EMAIL).first()).toBeVisible();

  // Audit tab loads.
  await page.getByRole('tab', { name: /audit/i }).click();
  await expect(page.getByRole('columnheader', { name: /action/i })).toBeVisible();

  /**
   * The SHELL itself, gated once here (M24 W2).
   *
   * The topbar rides on every authenticated route, so a violation in it is a
   * violation everywhere — which is exactly what happened: the command palette
   * trigger and the user-menu button both failed WCAG 2.5.3 (label in name) on
   * all nine measured routes, because their accessible names did not contain the
   * text a sighted user can see (`⌘K` and the avatar's initials).
   */
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
