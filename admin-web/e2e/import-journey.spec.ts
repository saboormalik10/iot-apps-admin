import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The Month-12 acceptance journey (plan §Month 12). Runs in the CI E2E job
 * against the seeded backend: sign in as the admin, walk the import wizard from
 * file → review → committed result, and assert the row count the client-side
 * dry-run predicted is the one the server actually wrote.
 *
 * That last assertion is the point of the whole test. There is no server dry-run,
 * so the preview is a MIRROR of the backend parser — and a mirror is only worth
 * anything if something proves the two still agree.
 */
const ADMIN_EMAIL = 'admin@observator.com';
const ADMIN_PASSWORD = 'Admin@1234';

// A fixed epoch, as the MET exporter writes it (bare ms). Re-importing this shape
// used to silently restamp every row to "now" — see parse-import-timestamp.ts.
const T0 = 1737000000000;
const MET_HEADER =
  'Timestamp,Temp_C,Humidity_%,Pressure_hPa,WindSpeed_ms,WindSpeed_kmh,WindDir_deg,DewPoint_C,Precip_mm,Solar_Wm2,Voltage_V,Lat,Lng';

const metCsv = (rows: number) =>
  [
    MET_HEADER,
    ...Array.from({ length: rows }, (_, i) =>
      [T0 + i * 60_000, 20 + (i % 5), 55, 1013, 3.2, 11.5, 180, 10.2, 0, 500, 12.1, 51.5, -0.12].join(','),
    ),
  ].join('\n');

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('Month 12 — import wizard', () => {
  test('admin imports a MET CSV and the server writes exactly what the preview predicted', async ({ page }) => {
    const ROWS = 12;
    await signIn(page);

    await page.goto('/import');
    await expect(page.getByRole('heading', { name: /import data/i })).toBeVisible();

    // Step 1 — choose the file.
    await page.setInputFiles('#import-file', {
      name: 'met-export.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(metCsv(ROWS)),
    });

    // Step 2 — review. The header is MET, so the wizard should have detected it.
    await expect(page.getByText(`${ROWS} data rows`)).toBeVisible();
    await expect(page.getByText(`${ROWS} will import`)).toBeVisible();
    // Epoch-ms timestamps must parse — a regression here shows up as "0 will import".
    await expect(page.getByText(/no valid data rows/i)).toHaveCount(0);

    // Can't submit without a device.
    const submit = page.getByRole('button', { name: /import .* rows/i });
    await expect(submit).toBeDisabled();

    // Pick the first MET-LINK device the seed created. Address the picker by its
    // accessible name — a positional locator would catch the Scope Bar's.
    await page.getByRole('combobox', { name: /import into device/i }).click();
    await page.getByRole('option').first().click();
    await expect(submit).toBeEnabled();

    // Step 3 — commit, and confirm the server agrees with the preview.
    await submit.click();
    await expect(page.getByRole('heading', { name: /import complete/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/measures inserted/i)).toBeVisible();
    await expect(page.getByText(String(ROWS)).first()).toBeVisible();
    // The wizard shows this only when the server's count differs from the preview.
    await expect(page.getByText(/the preview expected/i)).toHaveCount(0);
  });

  test('a malformed file is blocked before any upload happens', async ({ page }) => {
    await signIn(page);
    await page.goto('/import');

    await page.setInputFiles('#import-file', {
      name: 'broken.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Timestamp,Temp_C\nnot-a-date,20.1'),
    });

    await expect(page.getByText(/no valid data rows/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /import .* rows/i })).toBeDisabled();
  });

  test('the import screen has no serious accessibility violations (axe)', async ({ page }) => {
    await signIn(page);
    await page.goto('/import');
    await expect(page.getByRole('heading', { name: /import data/i })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious).toEqual([]);
  });
});

test.describe('Month 12 — command palette', () => {
  test('⌘K opens the palette and routes to a destination', async ({ page }) => {
    await signIn(page);

    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('listbox', { name: /search results/i });
    await expect(palette).toBeVisible();

    await page.getByRole('combobox').fill('devices');
    await page.getByRole('option', { name: /^devices$/i }).click();
    await expect(page).toHaveURL(/\/devices/);
  });

  test('the palette is reachable and operable by keyboard alone', async ({ page }) => {
    await signIn(page);
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('listbox')).toBeVisible();

    // Arrow to the second option and activate it — no mouse involved.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });
});
