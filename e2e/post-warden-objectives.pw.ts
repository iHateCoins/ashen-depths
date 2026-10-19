import { test, expect, type Page } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function selectObjective(page: Page): Promise<void> {
  const tab = page.locator('#ashen-interaction-objective');
  if (await tab.isVisible()) await tab.click();
}

test('unclaimed cache and shrine remain usable after Warden defeat', async ({ page }) => {
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const game = (window as any).__ashenE2eGame;
    const scene = game.scene.getScene('DungeonScene') as any;
    const guardian = scene.enemies.find((enemy: any) => enemy.id === scene.roomEncounters.guardianId);
    guardian.hp = 0;
    scene.roomEncounters.hasEnteredDepth = true;
    // Keep living regular enemies away from test objectives without claiming them.
    for (const enemy of scene.enemies) {
      if (enemy.id !== scene.roomEncounters.guardianId) enemy.hp = 0;
    }
  });
  await expect(page.getByRole('button', { name: 'FINISH EXPEDITION' })).toBeVisible({ timeout: 12_000 });
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    const cache = scene.optionalObjectives.objectives.find((item: any) => item.id === 'cache');
    scene.movement.stop();
    scene.waypoints = [];
    scene.movement.position = { ...cache.position };
  });
  await expect(page.locator('#ashen-interaction-objective')).toBeVisible({ timeout: 12_000 }).catch(async () => {
    await expect(page.locator('#ashen-optional-objective')).toBeVisible();
  });
  await selectObjective(page);
  await expect(page.getByRole('button', { name: 'OPEN CACHE' })).toBeVisible();
  await page.getByRole('button', { name: 'OPEN CACHE' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenBasicDamageBonus)).toBe('10');
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    const shrine = scene.optionalObjectives.objectives.find((item: any) => item.id === 'shrine');
    scene.movement.stop();
    scene.waypoints = [];
    scene.movement.position = { ...shrine.position };
    scene.health.damage(25);
  });
  await selectObjective(page);
  await expect(page.getByRole('button', { name: 'USE SHRINE' })).toBeVisible();
  await page.getByRole('button', { name: 'USE SHRINE' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenOptionalObjectives)).toBe('2');
  await expect(page.getByRole('button', { name: 'FINISH EXPEDITION' })).toBeVisible();
});

test('Warden victory does not disable a discovered waystone', async ({ page }) => {
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.roomEncounters.hasEnteredDepth = true;
    const guardian = scene.enemies.find((enemy: any) => enemy.id === scene.roomEncounters.guardianId);
    guardian.hp = 0;
    for (const enemy of scene.enemies) if (enemy.id !== guardian.id) enemy.position = { x: -2000, y: -2000 };
  });
  await expect(page.getByRole('button', { name: 'FINISH EXPEDITION' })).toBeVisible({ timeout: 12_000 });
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.movement.stop();
    scene.waypoints = [];
    scene.movement.position = { ...scene.extraction.sites[0].position };
  });
  await expect(page.getByRole('button', { name: 'EXTRACT NOW' })).toBeVisible({ timeout: 12_000 });
  await page.getByRole('button', { name: 'EXTRACT NOW' }).click();
  await expect(page.locator('#ashen-extraction-overlay')).toBeVisible({ timeout: 15_000 });
});
