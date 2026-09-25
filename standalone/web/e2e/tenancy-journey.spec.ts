import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Super-admin tenancy (M19 W1–W2).
 *
 * The risk this guards is a platform administrator acting inside a customer's
 * data without realising, and — worse — one customer's cached data rendering
 * under another customer's name after a switch.
 */
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';
const CUSTOMER = 'Acme Marine Services';

/** The tenancy warning specifically — other live regions also use role=status. */
const actingBanner = (page: Page) => page.getByRole('status', { name: /acting as another organisation/i });

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('M19 — organisation switching', () => {
  test('a customer admin is offered no switcher at all', async ({ page }) => {
    // They must not even learn that other customers exist.
    await signIn(page, 'admin@observator.com');
    await expect(page.getByRole('button', { name: /switch organisation/i })).toHaveCount(0);
    await expect(actingBanner(page)).toHaveCount(0);
  });

  test('a platform admin switches, is warned, and sees only that customer', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');

    const switcher = page.getByRole('button', { name: /switch organisation/i });
    await expect(switcher).toBeVisible();

    // The home org has a station; the customer has none — that difference is
    // what proves the switch actually re-scoped the data.
    await page.goto('/devices');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/WindSonic/i).first()).toBeVisible();

    await switcher.click();
    await page.getByText(CUSTOMER).click();

    // The banner is the safety net — unmissable and not dismissible.
    const banner = actingBanner(page);
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(CUSTOMER);
    await expect(banner).toContainText(/affect that customer/i);

    // No trace of the previous organisation's stations survived the switch.
    await page.goto('/devices');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/WindSonic/i)).toHaveCount(0);
  });

  test('the banner offers a way back, and leaving clears it', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.getByRole('button', { name: /switch organisation/i }).click();
    await page.getByText(CUSTOMER).click();
    await expect(actingBanner(page)).toBeVisible();

    await page.getByRole('button', { name: /return to my organisation/i }).click();
    await expect(actingBanner(page)).toHaveCount(0);

    // ...and the home organisation's data is back.
    await page.goto('/devices');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/WindSonic/i).first()).toBeVisible();
  });

  test('the acting-as banner has no serious accessibility violations (axe)', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.getByRole('button', { name: /switch organisation/i }).click();
    await page.getByText(CUSTOMER).click();
    await expect(actingBanner(page)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

    await page.getByRole('button', { name: /return to my organisation/i }).click();
    await expect(actingBanner(page)).toHaveCount(0);
  });

  test('the cross-customer page lists every customer, for a platform admin only', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.goto('/platform');

    await expect(page.getByRole('heading', { name: /all customers/i })).toBeVisible();
    // `.first()` — the name also appears in the Upload folders column, since a
    // customer's folder defaults to their name.
    await expect(page.getByText(CUSTOMER).first()).toBeVisible();
    await expect(page.getByText('Observator Instruments AU').first()).toBeVisible();
  });

  test('a customer admin cannot reach the cross-customer page', async ({ page }) => {
    await signIn(page, 'admin@observator.com');
    // Not in the nav...
    await expect(page.getByRole('link', { name: /all customers/i })).toHaveCount(0);
    // ...and not by typing the URL either.
    await page.goto('/platform');
    await expect(page.getByRole('heading', { name: /all customers/i })).toHaveCount(0);
  });

  test('the cross-customer page has no serious accessibility violations (axe)', async ({ page }) => {
    await signIn(page, 'superadmin@observator.com');
    await page.goto('/platform');
    await expect(page.getByRole('heading', { name: /all customers/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  test('a platform admin creates a customer and is shown the credentials once', async ({ page }) => {
    const stamp = Date.now();
    const name = `E2E Customer ${stamp}`;
    const email = `e2e-${stamp}@test.invalid`;

    await signIn(page, 'superadmin@observator.com');
    await page.goto('/platform');
    await page.getByRole('button', { name: /new customer/i }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/customer name/i).fill(name);
    await dialog.getByLabel(/first name/i).fill('Test');
    await dialog.getByLabel(/last name/i).fill('Operator');
    await dialog.getByLabel(/^email$/i).fill(email);
    await dialog.getByLabel(/^password$/i).fill('Passw0rd!e2e');
    await dialog.getByRole('button', { name: /create customer/i }).click();

    // Shown once, with everything needed to hand over.
    await expect(dialog.getByText(new RegExp(`${name} created`, 'i'))).toBeVisible();
    await expect(dialog.getByText(email)).toBeVisible();
    await expect(dialog.getByText('Passw0rd!e2e')).toBeVisible();
    await dialog.getByRole('button', { name: /^done$/i }).click();

    // ...and it appears in the cross-customer list. `.first()` because the name
    // also shows as the default upload folder in the same row.
    await expect(page.getByText(name).first()).toBeVisible();
  });
});
