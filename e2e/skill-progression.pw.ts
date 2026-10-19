import { test, expect, type Page } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function sceneState(page: Page) {
  return page.evaluate(() => {
    const scene = (window as Window & {
      __ashenE2eGame?: { scene: { getScene(name: string): unknown } };
    }).__ashenE2eGame!.scene.getScene('DungeonScene') as {
      progression: { pendingUnlocks: string[]; secured: string[] };
    };
    return {
      pending: scene.progression.pendingUnlocks,
      secured: scene.progression.secured,
    };
  });
}

test('Sealed Cache discovery is at risk, retained only after extraction and usable next expedition', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#ashen-skills-toggle')).toBeVisible();
  await page.locator('#ashen-skills-toggle').click();
  await expect(page.getByRole('button', { name: 'Equip Frost Bloom' })).toBeDisabled();
  await page.locator('#ashen-skills-overlay').getByRole('button', { name: 'CLOSE' }).click();

  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    const cache = scene.optionalObjectives.objectives.find((item: any) => item.id === 'cache');
    const ids = new Set(scene.roomEncounters.placements
      .filter((spawn: any) => spawn.roomId === cache.roomId).map((spawn: any) => spawn.id));
    for (const enemy of scene.enemies) {
      if (ids.has(enemy.id)) enemy.hp = 0;
      else enemy.position = { x: -1000 - enemy.id * 100, y: -1000 };
    }
    scene.movement.stop(); scene.waypoints = [];
    scene.movement.position = { ...cache.position };
  });
  const objectiveTab = page.locator('#ashen-interaction-objective');
  await expect.poll(async () =>
    await page.locator('#ashen-optional-objective').isVisible() || await objectiveTab.isVisible(),
  { timeout: 12_000 }).toBe(true);
  if (await objectiveTab.isVisible()) await objectiveTab.click();
  await expect(page.locator('#ashen-optional-objective')).toBeVisible();
  await page.getByRole('button', { name: 'OPEN CACHE' }).click();
  await expect(page.locator('#ashen-reward-toggle')).toBeVisible({ timeout: 12_000 });
  await page.locator('#ashen-reward-toggle').click();
  await page.getByRole('button', { name: 'Choose Frost Bloom' }).click();
  await expect.poll(async () => (await sceneState(page)).pending).toEqual(['skill:frost-bloom']);
  await expect(page.locator('#ashen-reward-overlay')).toBeHidden();

  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.movement.stop(); scene.waypoints = [];
    scene.movement.position = { ...scene.extraction.sites[0].position };
  });
  await expect(page.getByRole('button', { name: 'EXTRACT NOW' })).toBeVisible({ timeout: 12_000 });
  await page.getByRole('button', { name: 'EXTRACT NOW' }).click();
  await expect(page.locator('#ashen-extraction-overlay')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'NEW EXPEDITION' }).click();
  await expect.poll(async () => (await sceneState(page)).secured).toContain('skill:frost-bloom');
  await page.locator('#ashen-skills-toggle').click();
  await expect(page.getByRole('button', { name: 'Equip Frost Bloom' })).toBeEnabled();
});

test('unsecured Warden discovery vanishes after restart', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.roomEncounters.hasEnteredDepth = true;
    const guardian = scene.enemies.find((enemy: any) => enemy.id === scene.roomEncounters.guardianId);
    guardian.hp = 0;
    for (const enemy of scene.enemies) if (enemy.id !== guardian.id)
      enemy.position = { x: -1500, y: -1500 };
  });
  await expect(page.locator('#ashen-reward-toggle')).toBeVisible({ timeout: 12_000 });
  await page.locator('#ashen-reward-toggle').click();
  await page.getByRole('button', { name: 'Choose Ash Lance' }).click();
  await expect.poll(async () => (await sceneState(page)).pending).toContain('skill:ash-lance');
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.scene.restart();
  });
  await expect.poll(async () => (await sceneState(page)).pending).toEqual([]);
  expect((await sceneState(page)).secured).not.toContain('skill:ash-lance');
});
