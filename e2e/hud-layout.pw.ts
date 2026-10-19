import { test, expect } from '@playwright/test';

test('portrait HUD stays clear of minimap and finish action does not cover objectives', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Mirrors the tall phone screenshot rather than relying on the project's
  // default landscape-only viewport.
  await page.setViewportSize({ width: 707, height: 1536 });
  await page.goto('http://127.0.0.1:4173/ashen-depths/?seed=42');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });

  const hud = await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame?.scene.getScene('DungeonScene') as {
      dungeon: { columns: number; rows: number };
      titleLabel: { getBounds: () => { x: number; y: number; width: number; height: number } };
      healthLabel: { getBounds: () => { x: number; y: number; width: number; height: number } };
      objectiveLabel: { getBounds: () => { x: number; y: number; width: number; height: number } };
      status: { visible: boolean };
      debugButton: { visible: boolean };
    } | undefined;
    if (!scene) throw new Error('DungeonScene did not initialize');
    return {
      title: scene.titleLabel.getBounds(),
      health: scene.healthLabel.getBounds(),
      objective: scene.objectiveLabel.getBounds(),
      debugVisible: scene.debugButton.visible,
      detailedHudVisible: scene.status.visible,
      mapLeft: window.innerWidth - scene.dungeon.columns * 2 - 12,
      mapTop: 62,
      mapBottom: 62 + scene.dungeon.rows * 2,
    };
  });

  expect(hud.debugVisible).toBe(false);
  expect(hud.detailedHudVisible).toBe(false);
  expect(hud.title.y + hud.title.height).toBeLessThan(hud.mapTop - 16);
  expect(hud.health.x + hud.health.width).toBeLessThan(hud.mapLeft - 5);
  expect(hud.objective.x + hud.objective.width).toBeLessThan(hud.mapLeft - 5);
  expect(hud.objective.y).toBeGreaterThan(hud.health.y);
  expect(hud.objective.y + hud.objective.height).toBeLessThan(420);

  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      roomEncounters: { guardianId: number; hasEnteredDepth: boolean };
      enemies: { id: number; hp: number }[];
    };
    const guardian = scene.enemies.find(enemy => enemy.id === scene.roomEncounters.guardianId)!;
    guardian.hp = 0;
    scene.roomEncounters.hasEnteredDepth = true;
  });
  const finish = page.getByRole('button', { name: 'FINISH EXPEDITION' });
  await expect(finish).toBeVisible();
  const bounds = await finish.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThan(hud.mapBottom + 40);
  expect(bounds!.y).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
