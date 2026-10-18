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

  // This is where the visible Phaser child "REPLAY TRIAL" is rendered.
  // Click/tap the *canvas*, not a DOM stand-in for the actual game input.
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + bounds!.height / 2 + 50;
  if (test.info().project.name === 'desktop') {
    await page.mouse.click(x, y);
  } else {
    await page.touchscreen.tap(x, y);
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
