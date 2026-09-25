import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Roles & permissions (M18 W3).
 *
 * The point of this screen is that it shows different things to different
 * people, so the journey checks both identities: a platform administrator can
 * create and edit roles, an organisation admin — who holds `role:read` but not
 * `role:write` — sees the same list with no way to change it.
 */
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';
const SUPER_EMAIL = 'superadmin@observator.com';
const ADMIN_EMAIL = 'admin@observator.com';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('M18 — roles & permissions', () => {
  test('a platform administrator can see and open the role editor', async ({ page }) => {
    await signIn(page, SUPER_EMAIL);
    await page.goto('/roles');

    await expect(page.getByRole('heading', { name: /^roles$/i })).toBeVisible();
    // The three seeded roles are shared across every organisation.
    for (const name of ['Operator', 'Organisation Admin', 'Viewer']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }

    await page.getByRole('button', { name: /new role/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /new role/i })).toBeVisible();

    // The permission catalogue comes from the server; grouped, with a count.
    await expect(dialog.getByText(/of \d+ selected/)).toBeVisible();
    await expect(dialog.getByLabel(/view dashboards and analytics/i)).toBeVisible();
  });

  test('the editor refuses a role that grants nothing', async ({ page }) => {
    await signIn(page, SUPER_EMAIL);
    await page.goto('/roles');

    await page.getByRole('button', { name: /new role/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('E2E Should Not Save');
    await dialog.getByRole('button', { name: /create role/i }).click();

    await expect(dialog.getByRole('alert')).toContainText(/at least one permission/i);
    // Still open — nothing was created.
    await expect(dialog).toBeVisible();
  });

  test('an organisation admin sees the roles but cannot change them', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/roles');

    await expect(page.getByRole('heading', { name: /^roles$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Viewer', exact: true })).toBeVisible();

    // `role:write` is platform-level, so neither control is offered. The server
    // would refuse the save anyway — this is about not misleading the user.
    await expect(page.getByRole('button', { name: /new role/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /edit/i })).toHaveCount(0);
  });

  test('creates a role then deletes it, end to end', async ({ page }) => {
    // Self-sufficient: it makes its own fixture and removes it, so the suite can
    // run repeatedly without depending on whatever roles happen to exist.
    const name = `E2E Temp ${Date.now()}`;
    await signIn(page, SUPER_EMAIL);
    await page.goto('/roles');

    await page.getByRole('button', { name: /new role/i }).click();
    const editor = page.getByRole('dialog');
    await editor.getByLabel('Name').fill(name);
    await editor.getByLabel(/view dashboards and analytics/i).check();
    await editor.getByRole('button', { name: /create role/i }).click();

    const card = page.getByRole('heading', { name, exact: true });
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: `Delete ${name}` }).click();
    const confirm = page.getByRole('dialog');
    // Nobody holds a role created seconds ago, so no replacement is demanded.
    await expect(confirm.getByText(/nobody has this role/i)).toBeVisible();
    await confirm.getByRole('button', { name: /delete role/i }).click();

    await expect(card).toHaveCount(0);
  });

  test('the delete dialog demands a replacement when people hold the role', async ({ page }) => {
    await signIn(page, SUPER_EMAIL);
    await page.goto('/roles');

    // Every seeded role has holders, so any of them exercises the reassignment path.
    await page.getByRole('button', { name: /delete viewer/i }).click();
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByText(/(person has|people have) this role/i)).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /move them to/i })).toBeVisible();

    // The button says what will happen, and the dialog has no axe violations.
    await expect(dialog.getByRole('button', { name: /move \d+ and delete/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

    await dialog.getByRole('button', { name: /cancel/i }).click();
  });

  test('an organisation admin is offered no delete control', async ({ page }) => {
    // `role:delete` is platform-level — a customer must not remove a shared role.
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/roles');
    await expect(page.getByRole('heading', { name: 'Viewer', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^delete /i })).toHaveCount(0);
  });

  test('the roles screen has no serious accessibility violations (axe)', async ({ page }) => {
    await signIn(page, SUPER_EMAIL);
    await page.goto('/roles');
    await expect(page.getByRole('heading', { name: /^roles$/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious).toEqual([]);
  });

  test('the role editor dialog has no serious accessibility violations (axe)', async ({ page }) => {
    await signIn(page, SUPER_EMAIL);
    await page.goto('/roles');
    await page.getByRole('button', { name: /new role/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious).toEqual([]);
  });
});
