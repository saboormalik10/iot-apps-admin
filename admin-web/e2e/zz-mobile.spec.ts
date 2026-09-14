import { test, expect } from '@playwright/test';
const P = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('how the portal behaves at phone size', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('admin@observator.com');
  await page.getByLabel(/password/i).fill(P);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 90_000 });
  await page.waitForTimeout(4000);

  const w = page.viewportSize()!.width;
  console.log('VIEWPORT=' + w);

  // Horizontal overflow is the classic "not mobile ready" symptom.
  const check = async (label: string) => {
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    console.log(`${label} scrollW=${m.scrollW} clientW=${m.clientW} overflow=${m.scrollW > m.clientW + 2}`);
  };

  await check('DASHBOARD');
  await page.goto('/records'); await check('RECORDS');
  await page.goto('/analytics'); await check('ANALYTICS');
  await page.goto('/alerts'); await check('ALERTS');
  await page.goto('/audit'); await check('AUDIT');

  // Is the nav reachable on a phone?
  await page.goto('/');
  await page.waitForTimeout(2500);
  const burger = await page.getByRole('button', { name: /toggle|menu/i }).count();
  console.log('HAMBURGER_PRESENT=' + burger);
});
