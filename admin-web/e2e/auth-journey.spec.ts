import { test, expect } from '@playwright/test';

/**
 * The Month-7 acceptance journey (plan Verification §3). Runs in the CI E2E job
 * against the seeded backend. Signs in as the seeded admin, lands on the shell,
 * opens Organization → People, and confirms the audit tab loads.
 */
const ADMIN_EMAIL = 'admin@observator.com';
const ADMIN_PASSWORD = 'Admin@1234';

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
});
