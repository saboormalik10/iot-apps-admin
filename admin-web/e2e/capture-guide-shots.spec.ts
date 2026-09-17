import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Captures the screenshots for the user guides. Not a test of behaviour — it
 * drives the real app and saves what a user would actually see, so the guides
 * cannot drift from the product by being written from memory.
 *
 * Run with:  npx playwright test e2e/capture-guide-shots.spec.ts --project=chromium
 */

const OUT = join(process.cwd(), 'docs', 'guides', 'img');
mkdirSync(OUT, { recursive: true });

const CUSTOMER = { email: 'admin@observator.com', password: 'Admin@1234' };
const SUPERADMIN = { email: 'superadmin@observator.com', password: 'Admin@1234' };

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });
// Generous: the dev server compiles each route on first visit, and these walk
// every screen in one pass rather than one test per screen.
test.setTimeout(20 * 60_000);

/**
 * Sign in, retrying through the login throttle.
 *
 * The backend throttles login to 10 attempts a minute. Capturing both portals
 * means several sign-ins in quick succession, so a run that works once fails the
 * next time — and the form reports every failure as "invalid credentials", which
 * makes a throttle look like a wrong password. Backing off and retrying is the
 * honest fix here; the alternative is running the backend with the throttle off,
 * which would be testing a configuration nobody actually deploys.
 */
async function login(page: Page, who: { email: string; password: string }) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    /**
     * Wait for React to hydrate before touching the form.
     *
     * Until it does, the form is plain HTML and the button performs a NATIVE
     * submit — the browser issues `GET /login?` and the sign-in never happens.
     * It looks exactly like a rejected password, because the page simply
     * re-renders with empty fields. In dev the first visit also has to compile
     * the route, so this is seconds, not milliseconds.
     */
    await page.waitForLoadState('networkidle').catch(() => void 0);
    await page.waitForTimeout(2500);
    await page.getByLabel(/email/i).fill(who.email);
    await page.getByLabel(/password/i).fill(who.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    try {
      await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
      return;
    } catch {
      const msg = await page.locator('[role="alert"]').first().textContent().catch(() => null);
      console.log(`  login attempt ${attempt} failed${msg ? `: ${msg.trim()}` : ''} — backing off`);
      await page.waitForTimeout(attempt === 1 ? 3_000 : 65_000);
    }
  }
  throw new Error(`could not sign in as ${who.email} after 5 attempts`);
}

/** Give charts and tables a moment to paint before capturing. */
async function settle(page: Page, ms = 2500) {
  await page.waitForLoadState('networkidle').catch(() => void 0);
  await page.waitForTimeout(ms);
}

async function shot(page: Page, name: string, full = true) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  console.log(`  saved ${name}.png`);
}

/** Every screen a CUSTOMER sees. */
const CUSTOMER_SCREENS: [string, string][] = [
  ['/', 'cust-01-dashboard'],
  ['/devices', 'cust-02-stations'],
  ['/records', 'cust-03-records'],
  ['/analytics', 'cust-04-analytics'],
  ['/fleet', 'cust-05-fleet'],
  ['/alerts', 'cust-06-alerts'],
  ['/notifications', 'cust-07-notifications'],
  ['/share', 'cust-08-share'],
  ['/users', 'cust-09-users'],
  ['/roles', 'cust-10-roles'],
  ['/audit', 'cust-11-audit'],
  ['/stream-types', 'cust-12-stream-types'],
  ['/settings', 'cust-13-settings'],
  ['/org', 'cust-14-organisation'],
];

test('capture — customer portal', async ({ page }) => {
  await login(page, CUSTOMER);

  for (const [path, name] of CUSTOMER_SCREENS) {
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await settle(page);
    await shot(page, name);
  }

  // Detail screens need an id, so follow a real row rather than guessing one.
  await page.goto('/records');
  await settle(page);
  const firstRecord = page.locator('tbody tr').first();
  if (await firstRecord.count()) {
    await firstRecord.click();
    await page.waitForURL(/\/records\/[a-f0-9]{24}/, { timeout: 15_000 }).catch(() => void 0);
    await settle(page, 4000);
    await shot(page, 'cust-15-record-detail');
  }

  await page.goto('/devices');
  await settle(page);
  const firstDevice = page.locator('tbody tr').first();
  if (await firstDevice.count()) {
    await firstDevice.click();
    await page.waitForURL(/\/devices\/[a-f0-9]{24}/, { timeout: 15_000 }).catch(() => void 0);
    await settle(page, 3000);
    await shot(page, 'cust-16-station-detail');
  }
});

test('capture — login screen', async ({ page }) => {
  await page.goto('/login');
  await settle(page, 1200);
  await shot(page, 'shared-00-login', false);
  await page.goto('/forgot-password');
  await settle(page, 1200);
  await shot(page, 'shared-00b-forgot-password', false);
});

/** Every screen a PLATFORM ADMINISTRATOR sees. */
test('capture — admin portal', async ({ page }) => {
  await login(page, SUPERADMIN);

  await page.goto('/');
  await settle(page);
  await shot(page, 'admin-01-dashboard');

  await page.goto('/admin?tab=customers');
  await settle(page, 3500);
  await shot(page, 'admin-02-customers');

  await page.goto('/admin?tab=streams');
  await settle(page, 3000);
  await shot(page, 'admin-03-stream-types');

  await page.goto('/devices');
  await settle(page);
  await shot(page, 'admin-04-stations');

  await page.goto('/audit');
  await settle(page);
  await shot(page, 'admin-05-audit');

  // The customer switcher in the top bar — the control that decides whose data
  // every other screen shows.
  await page.goto('/');
  await settle(page);
  const switcher = page.getByRole('button', { name: /switch organisation/i });
  if (await switcher.count()) {
    await switcher.click();
    await page.waitForTimeout(900);
    await shot(page, 'admin-06-customer-switcher', false);
    await page.keyboard.press('Escape');
  }
});
