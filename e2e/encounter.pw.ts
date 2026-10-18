import { test, expect } from '@playwright/test';

test('combat trial starts its first wave on desktop and iPhone-compatible browsers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('http://127.0.0.1:4173/ashen-depths/');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);

  // Runtime-observable game state: verifies the director is actually running,
  // not merely that Phaser's canvas initialized.
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.ashenWave),
    { timeout: 20_000 }).toBe('1');
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.ashenEncounter),
    { timeout: 20_000 }).toBe('combat');

  await page.waitForTimeout(350);
  expect(errors).toEqual([]);
});
