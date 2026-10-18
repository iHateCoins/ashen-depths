import { test, expect } from '@playwright/test';

test('moving through combat does not crash the running scene on desktop and mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/ashen-depths/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  // Start the run by moving toward practice enemies; exercise both input paths.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (test.info().project.name === 'desktop') {
    await canvas.click({ position: { x: Math.min(450, box!.width - 20), y: Math.min(285, box!.height - 20) }, force: true });
  } else {
    await page.touchscreen.tap(box!.x + Math.min(450, box!.width - 20), box!.y + Math.min(285, box!.height - 20));
  }
  await page.waitForTimeout(1250);
  await expect(canvas).toBeVisible();
  await expect(page.locator('#boot-status')).toHaveCount(0);
  expect(errors).toEqual([]);
});
