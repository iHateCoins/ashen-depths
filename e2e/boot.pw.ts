import { test, expect } from '@playwright/test';

test('compiled Pages build displays a playable dungeon rather than a blank screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('http://127.0.0.1:4173/ashen-depths/', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBe(true);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);
  expect(errors).toEqual([]);
  const canvas = page.locator('canvas');
  if (test.info().project.name === 'mobile-landscape') {
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await page.touchscreen.tap(bounds!.x + 150, bounds!.y + 160);
  } else {
    await canvas.click({ position: { x: 150, y: 160 }, force: true });
  }
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
