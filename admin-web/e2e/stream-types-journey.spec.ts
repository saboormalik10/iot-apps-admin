import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Stream types and the sample preview (M22 W3).
 *
 * The screen exists so an operator can answer "will this file work?" before a
 * customer starts sending. What must be unmistakable: nothing is written, and an
 * ignored column is NAMED rather than silently dropped.
 */
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('M22 — stream types', () => {
  test('a customer admin cannot reach the page', async ({ page }) => {
    await signIn(page, 'admin@observator.com');
    await expect(page.getByRole('link', { name: /stream types/i })).toHaveCount(0);
    await page.goto('/stream-types');
    await expect(page.getByRole('heading', { name: /^stream types$/i })).toHaveCount(0);
  });

  test('shows which header cells a stream understands', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.goto('/stream-types');

    await expect(page.getByRole('heading', { name: 'Wind / MET CSV' })).toBeVisible();
    await page.getByRole('button', { name: /columns/i }).first().click();

    // The aliases are the point: an operator can check a header before going live.
    await expect(page.getByText('direction, direction_deg, winddir, winddir_deg, dir')).toBeVisible();
  });

  test('previews a sample and NAMES the column it ignored', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.goto('/stream-types');
    await page.getByRole('button', { name: /columns/i }).first().click();

    await page.getByLabel(/sample rows/i).fill(
      'timestamp,direction,speed,units,status,salinity\r\n2026-08-25T11:19:00+10:00,350,0.50,K,A,35\r\n',
    );
    await page.getByRole('button', { name: /^preview$/i }).click();

    await expect(page.getByText(/1 row would be stored/i)).toBeVisible();
    await expect(page.getByText(/does not recognise them/i)).toBeVisible();
    await expect(page.getByText('salinity', { exact: true })).toBeVisible();
    // And it says, plainly, that nothing was written.
    await expect(page.getByText(/nothing is saved/i)).toBeVisible();
  });

  test('reports a file it cannot read', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.goto('/stream-types');
    await page.getByRole('button', { name: /columns/i }).first().click();

    await page.getByLabel(/sample rows/i).fill('this is not a csv at all');
    await page.getByRole('button', { name: /^preview$/i }).click();
    await expect(page.getByText(/cannot be read/i)).toBeVisible();
  });

  test('the stream types screen has no serious accessibility violations (axe)', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.goto('/stream-types');
    await expect(page.getByRole('heading', { name: /^stream types$/i })).toBeVisible();
    await page.getByRole('button', { name: /columns/i }).first().click();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});
