import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4173/ashen-depths/';
const nextBuild = 'b'.repeat(40);
const pattern = '**/ashen-depths/version.json?**';

test('a freshly launched installed app automatically requests the new build only once', async ({ page }) => {
  const exceptions: string[] = [];
  page.on('pageerror', error => exceptions.push(error.message));
  await page.route(pattern, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ buildId: nextBuild }) });
  });
  await page.goto(base);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page).toHaveURL(new RegExp('build=' + nextBuild), { timeout: 15000 });
  // Simulate the worst case: the iPhone still serves the older bundled JS after a reload.
  // A visible retry option must replace another automatic navigation.
  await expect(page.locator('#ashen-update-notice')).toContainText('older cached copy', { timeout: 15000 });
  await page.waitForTimeout(700);
  expect(new URL(page.url()).searchParams.get('build')).toBe(nextBuild);
  expect(exceptions).toEqual([]);
});

test('an active expedition shows an update prompt and lets the player defer it', async ({ page }) => {
  const initial = await page.goto(base);
  expect(initial?.ok()).toBe(true);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#ashen-build-id')).toBeVisible();

  await page.route(pattern, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ buildId: nextBuild }) });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#ashen-update-notice')).toContainText('Update when you are ready', { timeout: 15000 });
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(page.locator('#ashen-update-notice')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('build')).toBe(false);
});
