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
  test('a customer sees the page, their own stations, and NO switch', async ({ page }) => {
    // Read-only for customers on purpose: switching a stream off stops data
    // arriving, and a customer doing that by accident would lose readings until
    // somebody noticed.
    await signIn(page, 'admin@observator.com');
    await expect(page.getByRole('link', { name: /stream types/i })).toHaveCount(1);
    await page.goto('/stream-types');
    await expect(page.getByRole('heading', { name: /^stream types$/i })).toBeVisible();

    await page.getByRole('button', { name: /view stations/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('switch')).toHaveCount(0);
    await expect(dialog.getByText(/only a platform administrator/i)).toBeVisible();
  });

  test('a super admin gets a switch per station, and can search them', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.goto('/stream-types');

    await page.getByRole('button', { name: /view stations \(\d+\)/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('switch').first()).toBeVisible();

    // Search exists because finding one station among a platform's worth is the
    // actual task; the count only appears once the list is long enough to need it.
    const search = dialog.getByLabel('Search stations');
    if (await search.count()) {
      const before = await dialog.locator('li').count();
      await search.fill('Sydney');
      await expect.poll(async () => dialog.locator('li').count(), { timeout: 10_000 }).toBeLessThan(before);
    }
  });

  test('shows which header cells a stream understands', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.goto('/stream-types');

    await expect(page.getByRole('heading', { name: 'Wind / MET CSV' })).toBeVisible();
    // Scoped to the MET card rather than `.first()`: a second format is
    // registered now and they sort alphabetically, so `.first()` opened the
    // Environmental card and then looked for wind aliases inside it.
    const metCard = page.locator('[data-stream-key="met-csv"]');
    await metCard.getByRole('button', { name: /columns/i }).click();

    // The aliases are the point: an operator can check a header before going live.
    await expect(page.getByText('direction, direction_deg, winddir, winddir_deg, dir')).toBeVisible();
  });

  test('previews a sample and NAMES the column it ignored', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.goto('/stream-types');
    // Scoped to the MET card rather than `.first()`: a second format is
    // registered now and they sort alphabetically, so `.first()` opened the
    // Environmental card and then looked for wind aliases inside it.
    const metCard = page.locator('[data-stream-key="met-csv"]');
    await metCard.getByRole('button', { name: /columns/i }).click();

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
