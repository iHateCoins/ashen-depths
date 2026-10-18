import { test, expect } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/';

test('victory New Expedition button receives an actual click/tap and restarts the dungeon', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(gameUrl);
  expect(response?.ok()).toBe(true);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  // Advance the real in-browser scene to the final victory state rather than
  // faking an HTML button; pointer hit-testing still runs through Phaser.
  await page.evaluate(() => {
    const runtime = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = runtime.__ashenE2eGame?.scene.getScene('DungeonScene') as {
      roomEncounters: { guardianId: number; hasEnteredDepth: boolean };
      enemies: { id: number; hp: number }[];
    } | undefined;
    if (!scene) throw new Error('Local E2E Phaser scene is missing');
    // Reproduce completion through the director's real condition: the deepest
    // chamber must have been visited and its guardian defeated.
    scene.roomEncounters.hasEnteredDepth = true;
    const guardian = scene.enemies.find(enemy => enemy.id === scene.roomEncounters.guardianId);
    if (!guardian) throw new Error('Missing deep-chamber guardian');
    guardian.hp = 0;
  });

  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEncounter
  ), { timeout: 10_000 }).toBe('complete');

  // PR01 keeps the run playable after the Warden dies so the player can
  // inspect/pick up its dropped treasure. Victory is finalized explicitly.
  const finish = page.getByRole('button', { name: 'FINISH EXPEDITION' });
  await expect(finish).toBeVisible();
  if (test.info().project.name === 'desktop') {
    await finish.click();
  } else {
    const bounds = await finish.boundingBox();
    expect(bounds).not.toBeNull();
    await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  }
  // Tap the native result-screen control, not a simulated restart call.
  const overlay = page.locator('#ashen-victory-overlay');
  await expect(overlay).toBeVisible();
  const button = overlay.getByRole('button', { name: 'NEW EXPEDITION' });
  await expect(button).toBeVisible();
  if (test.info().project.name === 'desktop') {
    await button.click();
  } else {
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  }

  // A new expedition regenerates the population and returns to exploration.
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEncounter
  ), { timeout: 5_000 }).toBe('explore');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenGuardianAlive
  ), { timeout: 5_000 }).toBe('true');
  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});

test('defeat Restart Expedition button remains touch accessible after exploration', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(gameUrl);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => {
    const runtime = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = runtime.__ashenE2eGame?.scene.getScene('DungeonScene') as {
      health: { hp: number; defeated: boolean };
      defeatOverlay: { show: () => void };
    } | undefined;
    if (!scene) throw new Error('Local E2E scene is missing');
    scene.health.hp = 0;
    scene.health.defeated = true;
    scene.defeatOverlay.show();
  });

  const overlay = page.locator('#ashen-defeat-overlay');
  await expect(overlay).toBeVisible();
  const button = overlay.getByRole('button', { name: 'RESTART EXPEDITION' });
  await expect(button).toBeVisible();
  if (test.info().project.name === 'desktop') {
    await button.click();
  } else {
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  }

  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEncounter
  ), { timeout: 5_000 }).toBe('explore');
  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});
