import { test, expect } from '@playwright/test';

/**
 * The Unit field on an alert rule is a dropdown, and its options follow the
 * chosen sensor (M25). A free-text unit was the underlying defect: the
 * evaluator converts the threshold out of this unit into the stored unit, so a
 * typo'd or nonsensical unit silently disarmed the rule.
 */
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin@1234';

test('unit options follow the sensor', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('superadmin@observator.com');
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/alerts');
  await page.getByRole('button', { name: /new rule/i }).click();
  const dialog = page.getByRole('dialog');

  // Before a sensor is picked there is nothing sensible to offer, so the
  // dropdown is disabled rather than showing every unit we know about.
  const unit = dialog.getByLabel('Unit');
  await expect(unit).toBeDisabled();
  await expect(unit).toContainText('Pick a sensor first');

  const sensor = dialog.getByLabel('Sensor');

  async function unitsFor(sensorLabel: string): Promise<string[]> {
    await sensor.click();
    await page.getByRole('option', { name: sensorLabel, exact: true }).click();
    await expect(unit).toBeEnabled();
    await unit.click();
    const opts = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    return opts.map((o) => o.trim());
  }

  expect(await unitsFor('Wind speed')).toEqual(['km/h', 'm/s', 'knots', 'mph']);
  expect(await unitsFor('Wind direction')).toEqual(['°']);
});
