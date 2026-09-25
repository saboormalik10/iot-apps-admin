import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The two things an operator asks about an alert: "why is my armed rule quiet?"
 * (the per-minute timeline) and "what actually happened?" (the notification
 * detail with its chart).
 */
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('superadmin@observator.com');
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('alert insight', () => {
  test('the rule drawer explains every minute of a chosen window', async ({ page }) => {
    await signIn(page);
    await page.goto('/alerts');

    await page.getByRole('button', { name: /trigger history/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /what this rule saw/i })).toBeVisible();

    // Window picker: 1 minute through 1 hour.
    const group = dialog.getByRole('group', { name: /timeline window/i });
    for (const label of ['Last 1 min', 'Last 5 min', 'Last 15 min', 'Last 30 min', 'Last 1 hour']) {
      await expect(group.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    // The per-minute table carries a verdict per row, not just numbers.
    await expect(dialog.getByRole('columnheader', { name: /result/i })).toBeVisible();
    await expect(dialog.getByRole('table')).toBeVisible();

    // Narrowing to one minute must actually narrow the table.
    await group.getByRole('button', { name: 'Last 1 hour', exact: true }).click();
    await expect.poll(async () => dialog.locator('tbody tr').count(), { timeout: 15_000 }).toBe(60);
    await group.getByRole('button', { name: 'Last 5 min', exact: true }).click();
    await expect.poll(async () => dialog.locator('tbody tr').count(), { timeout: 15_000 }).toBe(5);
  });

  test('the alert log reports the reading in the rule unit', async ({ page }) => {
    await signIn(page);
    await page.goto('/alerts');
    await page.getByRole('button', { name: /trigger history/i }).first().click();
    const dialog = page.getByRole('dialog');
    const log = dialog.getByRole('heading', { name: /alert log/i });
    await expect(log).toBeVisible();
    // A wind reading stored in m/s must never be printed with a km/h label.
    const body = await dialog.innerText();
    expect(body).not.toMatch(/\b0\.\d+\s*km\/h/);
  });

  test('an alert notification opens its own detail with a chart', async ({ page }) => {
    await signIn(page);
    await page.goto('/notifications');

    const first = page.getByRole('button').filter({ hasText: /New rule/ }).first();
    await first.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The comparison is the headline.
    await expect(dialog.getByText(/^Threshold$/)).toBeVisible();
    await expect(dialog.getByText(/^Over by$/)).toBeVisible();
    await expect(dialog.getByText(/Reading \((peak|low)\)/)).toBeVisible();
    // And the readings around it are plotted.
    await expect(dialog.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 15_000 });
    // It stayed on /notifications rather than deep-linking away.
    await expect(page).toHaveURL(/\/notifications/);
  });

  test('neither surface has a serious accessibility violation (axe)', async ({ page }) => {
    await signIn(page);
    await page.goto('/alerts');
    await page.getByRole('button', { name: /trigger history/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
