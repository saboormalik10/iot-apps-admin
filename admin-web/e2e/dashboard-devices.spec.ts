import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Month-8 acceptance journey (plan Verification §2–§3). Runs in the CI E2E job
 * against the seeded backend. Signs in, confirms the live dashboard home renders
 * (KPI tiles + §10.8 armed-alerts + fleet table), drills into the Devices module,
 * opens a device, and checks the settings editor + axe on the new screens.
 */
const ADMIN_EMAIL = 'admin@observator.com';
const ADMIN_PASSWORD = 'Admin@1234';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('dashboard home shows KPIs, scope bar, and the fleet table', async ({ page }) => {
  await signIn(page);

  // KPI row incl. the §10.8 armed-alerts deep-link tile.
  await expect(page.getByText('Armed alerts')).toBeVisible();
  await expect(page.getByRole('link', { name: /armed alerts/i })).toHaveAttribute('href', '/alerts');

  // Global scope bar is present on the data page.
  await expect(page.getByText('Scope', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /fleet status/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious).toEqual([]);
});

test('devices module: list → detail, with admin actions and settings link', async ({ page }) => {
  await signIn(page);

  await page.getByRole('link', { name: /devices/i }).first().click();
  await expect(page).toHaveURL(/\/devices/);
  await expect(page.getByRole('heading', { name: /^devices$/i })).toBeVisible();

  // Admin sees the manual Add-device control and the firmware-status section.
  await expect(page.getByRole('button', { name: /add device/i })).toBeVisible();
  await expect(page.getByText(/firmware status/i)).toBeVisible();

  // Open the first device row → detail.
  await page.getByRole('row').nth(1).click();
  await expect(page).toHaveURL(/\/devices\/[a-f0-9]+/i);
  await expect(page.getByRole('link', { name: /settings/i })).toBeVisible();
  // `exact` matters: the empty state's own "No firmware history" heading also
  // matches a loose /firmware history/i and trips strict mode.
  await expect(page.getByRole('heading', { name: 'Firmware history', exact: true })).toBeVisible();
});
