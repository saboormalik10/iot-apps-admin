import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Month-8 acceptance journey (plan Verification §2–§3). Runs in the CI E2E job
 * against the seeded backend. Signs in, confirms the live dashboard home renders
 * (KPI tiles + fleet table), drills into the Devices module,
 * opens a device, and checks the settings editor + axe on the new screens.
 */
const ADMIN_EMAIL = 'admin@observator.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('dashboard home shows KPIs, scope bar, and the fleet table', async ({ page }) => {
  await signIn(page);

  // KPI row. The §10.8 armed-alerts tile is gone while alerts are switched off —
  // restore both assertions if the section comes back.
  await expect(page.getByText('Devices').first()).toBeVisible();
  await expect(page.getByText('Armed alerts')).toHaveCount(0);

  // Global scope bar is present on the data page.
  await expect(page.getByText('Scope', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /fleet status/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious).toEqual([]);
});

test('devices module: list → detail, with admin actions and settings link', async ({ page }) => {
  await signIn(page);

  // The nav item and the heading both read "Stations" — the label was renamed
  // from "Devices" while the route stayed /devices, which left this locator
  // matching nothing and the test timing out.
  await page.getByRole('link', { name: /stations/i }).first().click();
  await expect(page).toHaveURL(/\/devices/);
  await expect(page.getByRole('heading', { name: /^stations$/i })).toBeVisible();

  // Neither the Add-device control nor the firmware-status section is here any
  // more. Add-station went when provisioning moved to the platform screen;
  // firmware went on 9 Sep 2026 because `firmwareVersion` is only ever typed in
  // by hand — a CSV-over-SFTP station cannot report it, so the panel could only
  // show dashes. Asserted ABSENT so neither quietly comes back.
  await expect(page.getByText(/firmware status/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /add device/i })).toHaveCount(0);

  // Open the first device row → detail.
  //
  // Wait for the STATUS CELL, not merely for the row to hold a word: while the
  // table is loading it renders a skeleton whose placeholder markup already
  // satisfies a bare /\w/, so the old guard let the click land mid-render and
  // navigate nowhere. Every loaded row carries Online or Offline; a skeleton
  // carries neither, which makes this a real wait rather than a hopeful one.
  const firstRow = page.getByRole('row').nth(1);
  await expect(firstRow.getByText(/online|offline/i).first()).toBeVisible();
  await firstRow.click();
  await expect(page).toHaveURL(/\/devices\/[a-f0-9]+/i);
  await expect(page.getByRole('link', { name: /settings/i })).toBeVisible();
  // M25: the firmware-history card is gone from the detail page — only the BLE
  // heartbeat ever created FirmwareHistory rows, so an ingest-fed station showed
  // nothing but its empty state. The health summary is what the page asserts now.
  await expect(page.getByText(/last seen/i)).toBeVisible();
  await expect(page.getByText(/sync lag/i)).toBeVisible();
});
