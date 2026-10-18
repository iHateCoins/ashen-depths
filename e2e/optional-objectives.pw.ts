import { test, expect, type Page } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

interface LocalDungeonScene {
  optionalObjectives: {
    claimedCount: number;
    attackBonus: number;
    objectives: { id: 'cache' | 'shrine'; roomId: number; position: { x: number; y: number } }[];
  };
  roomEncounters: {
    placements: { id: number; roomId: number }[];
  };
  enemies: { id: number; hp: number }[];
  health: { hp: number; defeated: boolean };
  combat: { bonusDamage: number };
  movement: { position: { x: number; y: number }; stop: () => void };
  waypoints: { x: number; y: number }[];
  defeatOverlay: { show: () => void };
}

test('guarded cache rewards damage, optional shrine heals, and restart resets both', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(gameUrl);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);

  await page.evaluate(() => {
    const runtime = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as LocalDungeonScene;
    const cache = scene.optionalObjectives.objectives.find(item => item.id === 'cache')!;
    scene.movement.stop();
    scene.waypoints = [];
    scene.movement.position = { ...cache.position };
  });

  const panel = page.locator('#ashen-optional-objective');
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel).toContainText('Defeat');
  await expect(panel.getByRole('button', { name: 'GUARDED' })).toBeDisabled();

  await page.evaluate(() => {
    const runtime = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as LocalDungeonScene;
    // Clear only this optional encounter first; all other rooms remain live.
    const cache = scene.optionalObjectives.objectives.find(item => item.id === 'cache')!;
    const guardians = new Set(scene.roomEncounters.placements
      .filter(spawn => spawn.roomId === cache.roomId).map(spawn => spawn.id));
    for (const enemy of scene.enemies) if (guardians.has(enemy.id)) enemy.hp = 0;
  });

  const button = panel.getByRole('button', { name: 'OPEN CACHE' });
  await expect(button).toBeEnabled({ timeout: 10_000 });
  if (test.info().project.name === 'desktop') await button.click();
  else {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenBasicDamageBonus),
    { timeout: 10_000 }).toBe('10');
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => {
    const gameWindow = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = gameWindow.__ashenE2eGame!.scene.getScene('DungeonScene') as LocalDungeonScene;
    return scene.optionalObjectives.claimedCount;
  })).toBe(1);

  await page.evaluate(() => {
    const runtime = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as LocalDungeonScene;
    const shrine = scene.optionalObjectives.objectives.find(item => item.id === 'shrine')!;
    // Remove enemies from the shrine area to isolate the actual interaction.
    const occupantIds = new Set(scene.roomEncounters.placements
      .filter(spawn => spawn.roomId === shrine.roomId).map(spawn => spawn.id));
    for (const enemy of scene.enemies) if (occupantIds.has(enemy.id)) enemy.hp = 0;
    scene.movement.stop();
    scene.waypoints = [];
    scene.movement.position = { ...shrine.position };
    scene.health.hp = 60;
  });

  const shrineButton = panel.getByRole('button', { name: 'USE SHRINE' });
  await expect(shrineButton).toBeEnabled({ timeout: 10_000 });
  if (test.info().project.name === 'desktop') await shrineButton.click();
  else {
    const box = await shrineButton.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
  await expect.poll(async () => page.evaluate(() => {
    const runtime = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as LocalDungeonScene;
    return scene.optionalObjectives.claimedCount;
  }), { timeout: 10_000 }).toBe(2);

  expect(await page.evaluate(() => {
    const runtime = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as LocalDungeonScene;
    return { hp: scene.health.hp, bonus: scene.combat.bonusDamage };
  })).toEqual({ hp: 95, bonus: 10 });

  await page.evaluate(() => {
    const runtime = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as LocalDungeonScene;
    scene.health.hp = 0;
    scene.health.defeated = true;
    scene.defeatOverlay.show();
  });
  const restart = page.locator('#ashen-defeat-overlay').getByRole('button', { name: 'RESTART EXPEDITION' });
  await expect(restart).toBeVisible();
  if (test.info().project.name === 'desktop') await restart.click();
  else {
    const box = await restart.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenOptionalObjectives),
    { timeout: 10_000 }).toBe('0');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenBasicDamageBonus),
    { timeout: 10_000 }).toBe('0');
  await expect(page.locator('#ashen-optional-objective')).toHaveCount(1);
  expect(errors).toEqual([]);
});
