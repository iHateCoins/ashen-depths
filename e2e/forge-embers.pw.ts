import { expect, test, type Locator, type Page } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function tap(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible({ timeout: 12_000 });
  await target.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') await target.click();
  else await target.tap();
}

test('full unlock collection still earns extraction-risked Forge Embers and can reforge secured gear at camp', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('ashen-depths-stash-v1', JSON.stringify({
      schema: 1, revision: 1, completed: 1,
      unlocks: [
        'skill:frost-bloom', 'skill:ash-lance', 'skill:crescent-cleave',
        'skill:piercing-volley', 'skill:arc-relay',
        'support:focused-power', 'support:expansive-blast', 'support:swift-casting',
      ],
      items: [{
        id: 'safe-rare-1', name: 'Forgotten Iron Cleaver', baseName: 'Iron Cleaver',
        slot: 'weapon', rarity: 'rare', itemLevel: 8,
        affixes: [
          { id: 'sharp', label: 'Attack Power', value: 7 },
          { id: 'ember', label: 'Ember Potency', value: 9 },
        ],
      }],
    }));
  });
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    scene.roomEncounters.hasEnteredDepth = true;
    const warden = scene.enemies.find((enemy: any) =>
      enemy.id === scene.roomEncounters.guardianId);
    warden.hp = 0;
    for (const enemy of scene.enemies) {
      if (enemy.id !== warden.id) enemy.position = { x: -2000, y: -2000 };
    }
  });
  const discoveries = page.locator('#ashen-reward-toggle');
  await expect(discoveries).toBeVisible({ timeout: 12_000 });
  await tap(page, discoveries);
  const reward = page.locator('#ashen-reward-overlay');
  await expect(reward).toBeVisible();
  await expect(reward).toContainText('Warden Discovery');
  await expect(reward.getByRole('button', { name: 'Choose Forge Ember' })).toBeVisible();
  await tap(page, reward.getByRole('button', { name: 'Choose Forge Ember' }));
  await expect(reward).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenPendingForgeEmbers)).toBe('1');
  // Warden completion provides a deliberate save, but claiming the reward did not.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!).forgeEmbers ?? 0)).toBe(0);
  await tap(page, page.getByRole('button', { name: 'FINISH EXPEDITION' }));
  await expect(page.locator('#ashen-victory-overlay')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#ashen-victory-overlay')).toContainText('1 Forge Embers secured');

  await tap(page, page.locator('#ashen-victory-overlay').getByRole('button', { name: 'NEW EXPEDITION' }));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenSecuredForgeEmbers)).toBe('1');
  await tap(page, page.locator('#ashen-stash-toggle'));
  const stash = page.locator('#ashen-stash-overlay');
  await expect(stash).toBeVisible();
  await expect(stash).toContainText('1 Forge Ember');
  const firstAffix = stash.getByRole('button', { name: 'Reforge Attack Power on Forgotten Iron Cleaver' });
  await tap(page, firstAffix);
  await expect(stash).toContainText('Affix reforged and saved');
  await expect(stash).toContainText('0 Forge Embers');
  await expect(stash.getByRole('button', { name: /^Reforge / }).first()).toBeDisabled();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(stored.forgeEmbers).toBe(0);
  expect(stored.items).toHaveLength(1);
  expect(stored.items[0].id).toBe('safe-rare-1');
  expect(stored.items[0].affixes[1]).toEqual({ id: 'ember', label: 'Ember Potency', value: 9 });
  expect(stored.items[0].affixes[0]).not.toEqual({ id: 'sharp', label: 'Attack Power', value: 7 });
  expect(stored.unlocks).toHaveLength(8);
  expect(errors).toEqual([]);
});
