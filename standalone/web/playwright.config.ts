import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright runs against a running admin-web (+ real backend + simulator) in the
 * CI E2E job, and re-runs against the Vercel preview post-deploy (plan §15).
 * baseURL is overridable so both targets use the same suite.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
