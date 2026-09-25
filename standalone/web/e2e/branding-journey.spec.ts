import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Branding settings (M20 W1).
 *
 * A customer names and colours their own copy of the panel. The value that
 * matters most is that a rejected value is reported in the styled, translated
 * message beside the field rather than by the browser's native validation.
 */
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('M20 — branding', () => {
  test('an admin edits and saves branding', async ({ page }) => {
    await signIn(page, 'admin@observator.com');
    await page.goto('/settings');

    const name = page.getByLabel(/display name/i);
    await expect(name).toBeVisible();
    await name.fill('Observator AU');
    await page.getByRole('button', { name: /save branding/i }).click();

    // Survives a reload, so it really persisted.
    await page.reload();
    await expect(page.getByLabel(/display name/i)).toHaveValue('Observator AU');
  });

  test('a bad accent colour is refused with our own message, not the browser’s', async ({ page }) => {
    await signIn(page, 'admin@observator.com');
    await page.goto('/settings');

    await page.getByLabel(/accent colour/i).fill('red');
    await page.getByRole('button', { name: /save branding/i }).click();
    await expect(page.getByText(/hex value like/i)).toBeVisible();
  });

  test('an unreadable accent is caught while typing, before any save', async ({ page }) => {
    await signIn(page, 'admin@observator.com');
    await page.goto('/settings');

    // A pale yellow: fine on paper, invisible as a button on a white page.
    await page.getByLabel(/accent colour/i).fill('#facc15');
    await expect(page.getByText(/nearly disappears on a light background/i)).toBeVisible();

    // ...and the save is blocked, not merely warned about.
    await page.getByRole('button', { name: /save branding/i }).click();
    await expect(page.getByText(/will not be readable/i)).toBeVisible();
  });

  test('a readable accent is confirmed with its ratios and repaints the shell', async ({ page }) => {
    await signIn(page, 'admin@observator.com');
    await page.goto('/settings');

    await page.getByLabel(/accent colour/i).fill('#0d9488');
    await expect(page.getByText(/Readable in both light and dark mode/i)).toBeVisible();
    await page.getByRole('button', { name: /save branding/i }).click();

    // The token really changed, which is what makes every control follow.
    await page.goto('/');
    await expect
      .poll(async () =>
        page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()),
      )
      .toBe('175 84% 32%');

    // Put it back so the suite is repeatable.
    await page.goto('/settings');
    await page.getByLabel(/accent colour/i).fill('#1f6feb');
    await page.getByRole('button', { name: /save branding/i }).click();
    await expect(page.getByText(/Readable in both/i)).toBeVisible();
  });

  test('a viewer sees the branding but cannot change it', async ({ page }) => {
    await signIn(page, 'viewer@observator.com');
    await page.goto('/settings');

    await expect(page.getByLabel(/display name/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /save branding/i })).toHaveCount(0);
    await expect(page.getByText(/only an administrator can change branding/i)).toBeVisible();
  });

  test('the settings screen has no serious accessibility violations (axe)', async ({ page }) => {
    await signIn(page, 'admin@observator.com');
    await page.goto('/settings');
    await expect(page.getByLabel(/display name/i)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  test('a shared link carries the customer\'s name, with no sign-in', async ({ page, request }) => {
    // Create a share as the admin, then view it as a stranger would.
    await signIn(page, 'admin@observator.com');
    const token = await page.evaluate(async () => {
      const recs = await fetch('/api/records?limit=1').then((r) => r.json());
      const id = recs?.data?.[0]?._id ?? recs?.data?.rows?.[0]?._id;
      const made = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resourceType: 'metRecord', resourceId: id }),
      }).then((r) => r.json());
      return made?.data?.token as string;
    });
    expect(token).toBeTruthy();

    // A fresh context with no cookies — exactly what the recipient has.
    const anon = await page.context().browser()!.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`/s/${token}`);
    await expect(anonPage.getByText('Observator AU')).toBeVisible();
    await expect(anonPage.getByText(/read-only shared view/i)).toBeVisible();
    await anon.close();

    void request;
  });
});
