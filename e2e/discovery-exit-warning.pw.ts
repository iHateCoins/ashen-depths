import { test, expect, type Page, type Locator } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function select(page: Page, button: Locator): Promise<void> {
  await expect(button).toBeVisible({ timeout: 12000 });
  await button.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') await button.click();
  else await button.tap();
}

test('Warden exit explicitly warns about unclaimed discovery rewards', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.roomEncounters.hasEnteredDepth = true;
    const boss = scene.enemies.find((enemy: any) =>
      enemy.id === scene.roomEncounters.guardianId);
    boss.hp = 0;
    for (const enemy of scene.enemies) {
      if (enemy.id !== boss.id) enemy.position = { x: -2000, y: -2000 };
    }
  });
  await expect(page.locator('#ashen-reward-toggle')).toContainText('CLAIM REWARDS 1', { timeout: 12000 });
  const finish = page.getByRole('button', { name: 'FINISH EXPEDITION' });
  await expect(finish).toContainText('1 UNCLAIMED REWARD LOST');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenUnclaimedDiscoveries)).toBe('1');
  await select(page, finish);
  const victory = page.locator('#ashen-victory-overlay');
  await expect(victory).toBeVisible();
  await expect(victory).toContainText('0 Forge Embers secured');
  await expect(victory).toContainText('1 unclaimed discovery reward forfeited');
});

test('waystone warns before extracting without selecting a discovered reward', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.progression.offer('cache');
    scene.movement.stop();
    scene.waypoints = [];
    scene.movement.position = { ...scene.extraction.sites[0].position };
    for (const enemy of scene.enemies) enemy.position = { x: -2000, y: -2000 };
  });
  await expect(page.locator('#ashen-reward-toggle')).toContainText('CLAIM REWARDS 1', { timeout: 12000 });
  const waystone = page.locator('#ashen-extraction-panel');
  await expect(waystone).toBeVisible({ timeout: 12000 });
  await expect(waystone).toContainText('UNCLAIMED');
  await expect(waystone).toContainText('Use CLAIM REWARDS first');
  const button = waystone.getByRole('button', { name: 'EXTRACT NOW' });
  await expect(button).toContainText('1 REWARD LOST');
  await select(page, button);
  const victory = page.locator('#ashen-extraction-overlay');
  await expect(victory).toBeVisible({ timeout: 16000 });
  await expect(victory).toContainText('1 unclaimed discovery reward forfeited');
});

test('selecting an Ember clears Warden exit warning and saves the reward', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.roomEncounters.hasEnteredDepth = true;
    const boss = scene.enemies.find((enemy: any) =>
      enemy.id === scene.roomEncounters.guardianId);
    boss.hp = 0;
    for (const enemy of scene.enemies) if (enemy.id !== boss.id)
      enemy.position = { x: -2000, y: -2000 };
  });
  await select(page, page.locator('#ashen-reward-toggle'));
  await select(page, page.locator('#ashen-reward-overlay').getByRole('button', { name: 'Choose Forge Ember' }));
  const finish = page.getByRole('button', { name: 'FINISH EXPEDITION' });
  await expect(finish).toHaveText('FINISH EXPEDITION');
  await select(page, finish);
  await expect(page.locator('#ashen-victory-overlay')).toContainText('1 Forge Embers secured');
  await expect(page.locator('#ashen-victory-overlay')).not.toContainText('forfeited');
});
