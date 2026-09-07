import { test, expect, type Page } from '@playwright/test';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('superadmin@observator.com');
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}
test('net', async ({ page }) => {
  await signIn(page);
  const seen: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/records?')) seen.push(r.url()); });

  for (const url of ['/records?range=1h', '/records', '/records?range=7d']) {
    seen.length = 0;
    await page.goto(url);
    await page.waitForTimeout(2500);
    const rows = await page.locator('tbody tr').count();
    const label = await page.getByLabel('Date range').textContent().catch(() => '?');
    console.log(`\nUI ${url}`);
    console.log(`   scope dropdown shows : ${label?.trim()}`);
    console.log(`   final URL            : ${new URL(page.url()).pathname + new URL(page.url()).search}`);
    console.log(`   rows in table        : ${rows}`);
    for (const s of seen) {
      const u = new URL(s);
      const from = u.searchParams.get('from'); const to = u.searchParams.get('to');
      const span = from && to ? ((+to - +from) / 3600000).toFixed(2) + ' h' : 'none';
      console.log(`   request span         : ${span}`);
    }
  }
});
