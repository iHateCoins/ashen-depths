import { test, expect } from '@playwright/test';

test('seeded rooms start populated; the entrance is safe and guardian completion is optional-room independent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('http://127.0.0.1:4173/ashen-depths/?seed=42');
  expect(response?.ok()).toBe(true);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);

  const initial = await page.evaluate(() => {
    const runtime = window as Window & { __ashenE2eGame?: {
      scene: { getScene: (key: string) => unknown };
    } };
    const scene = runtime.__ashenE2eGame?.scene.getScene('DungeonScene') as {
      dungeon: { seed: number; entrance: {x:number;y:number} };
      roomEncounters: { guardianId: number; totalEnemies: number; completed: boolean };
      enemies: { id: number; hp: number; position: {x:number;y:number}; aggro: boolean }[];
      movement: { position: {x:number;y:number} };
    } | undefined;
    if (!scene) throw new Error('DungeonScene unavailable');
    const guardian = scene.enemies.find(enemy => enemy.id === scene.roomEncounters.guardianId);
    return {
      seed: scene.dungeon.seed,
      enemyCount: scene.enemies.length,
      plannedCount: scene.roomEncounters.totalEnemies,
      guardianFound: Boolean(guardian && guardian.hp > 0),
      initialPosition: { ...scene.movement.position },
      entrance: scene.dungeon.entrance,
      complete: scene.roomEncounters.completed,
      aggroAtStart: scene.enemies.filter(enemy => enemy.aggro).length,
    };
  });

  expect(initial.seed).toBe(42);
  expect(initial.enemyCount).toBeGreaterThan(10);
  expect(initial.enemyCount).toBe(initial.plannedCount);
  expect(initial.guardianFound).toBe(true);
  expect(initial.initialPosition).toEqual(initial.entrance);
  expect(initial.complete).toBe(false);

  // An enemy in a connected room can be pursued when approached;
  // all-room clear is deliberately not required to finish the expedition.
  await expect.poll(async () => page.evaluate(
    () => document.documentElement.dataset.ashenEncounter
  ), { timeout: 15000 }).toBe('explore');
  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});
