import { test, expect } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/';

test('victory Replay Trial button receives an actual click/tap and restarts the encounter', async ({ page }) => {
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
      encounters: { phase: string; wave: number };
      enemies: { hp: number }[];
    } | undefined;
    if (!scene) throw new Error('Local E2E Phaser scene is missing');
    scene.encounters.phase = 'combat';
    scene.encounters.wave = 3;
    for (const enemy of scene.enemies) enemy.hp = 0;
  });

  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEncounter
  ), { timeout: 10_000 }).toBe('complete');

  // Tap the native on-screen control itself, not a simulated restart call.
  const overlay = page.locator('#ashen-victory-overlay');
  await expect(overlay).toBeVisible();
  const button = overlay.getByRole('button', { name: 'REPLAY TRIAL' });
  await expect(button).toBeVisible();
  if (test.info().project.name === 'desktop') {
    await button.click();
  } else {
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  }

  // Scene restart makes the trial's state countdown/wave 0; wave 1 begins later.
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEncounter
  ), { timeout: 5_000 }).toBe('countdown');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenWave
  ), { timeout: 5_000 }).toBe('0');
  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});

test('defeat Restart Expedition button also receives pointer events after scrolling', async ({ page }) => {
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
  ), { timeout: 5_000 }).toBe('countdown');
  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});
