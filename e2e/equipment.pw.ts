import { test, expect, type Page } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function touchOrClick(page: Page, button: import('@playwright/test').Locator, projectName: string) {
  await expect(button).toBeVisible();
  if (projectName === 'desktop') return button.click();
  const bounds = await button.boundingBox();
  expect(bounds).not.toBeNull();
  await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
}

test('equip and unequip actual dropped item with mobile taps, apply stats, reset on defeat', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(gameUrl);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);

  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame?.scene.getScene('DungeonScene') as {
      movement: { position: { x: number; y: number } };
      enemies: { id: number; kind: string; hp: number; position: { x: number; y: number } }[];
      roomEncounters: { guardianId: number };
    } | undefined;
    if (!scene) throw new Error('Local dungeon scene is unavailable');
    const brute = scene.enemies.find(enemy =>
      enemy.kind === 'brute' && enemy.id !== scene.roomEncounters.guardianId);
    if (!brute) throw new Error('Expected a Brute in the dungeon');
    brute.position = { x: scene.movement.position.x + 40, y: scene.movement.position.y + 8 };
    brute.hp = 0;
  });

  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenGroundCount
  ), { timeout: 10000 }).toBe('1');
  const pickup = page.locator('#ashen-loot-nearby').getByRole('button', { name: 'PICK UP' });
  await touchOrClick(page, pickup, test.info().project.name);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenBagCount
  ), { timeout: 10000 }).toBe('1');

  const before = await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      loot: { bag: { id: string; slot: string; name: string }[] };
      health: { maxHp: number };
      loadout: { stats: { attack: number; spell: number; armor: number; health: number } };
    };
    return { item: { ...scene.loot.bag[0] }, maxHp: scene.health.maxHp, stats: { ...scene.loadout.stats } };
  });
  expect(before.maxHp).toBe(100);
  expect(before.stats).toEqual({ attack: 0, spell: 0, armor: 0, health: 0 });

  await touchOrClick(page, page.locator('#ashen-bag-toggle'), test.info().project.name);
  const modal = page.locator('#ashen-bag-overlay');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.ashen-equipped-slot')).toHaveCount(3);
  await expect(modal.locator('.ashen-bag-item')).toHaveCount(1);
  await expect(modal.locator('.ashen-bag-comparison')).toContainText('If equipped:');

  const equip = modal.getByRole('button', { name: new RegExp(`^Equip ${before.item.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`) });
  await touchOrClick(page, equip, test.info().project.name);
  await expect(modal.locator('.ashen-bag-item')).toHaveCount(0);
  await expect(modal.locator('.ashen-equipped-slot').filter({ hasText: before.item.name })).toHaveCount(1);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEquipmentCount
  ), { timeout: 10000 }).toBe('1');

  const worn = await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      loot: { bag: { id: string }[] };
      health: { maxHp: number };
      combat: { bonusDamage: number };
      skills: { bonusDamage: number };
      loadout: {
        get: (slot: string) => { id: string } | null;
        stats: { attack: number; spell: number; armor: number; health: number };
      };
    };
    return {
      bag: scene.loot.bag.length,
      wornId: scene.loadout.get('weapon')?.id ??
        scene.loadout.get('armor')?.id ?? scene.loadout.get('charm')?.id,
      stats: scene.loadout.stats,
      maxHp: scene.health.maxHp,
      attackBonus: scene.combat.bonusDamage,
      spellBonus: scene.skills.bonusDamage,
    };
  });
  expect(worn.bag).toBe(0);
  expect(worn.wornId).toBe(before.item.id);
  expect(worn.maxHp).toBe(100 + worn.stats.health);
  expect(worn.attackBonus).toBe(worn.stats.attack);
  expect(worn.spellBonus).toBe(worn.stats.spell);
  expect(worn.stats.attack + worn.stats.spell + worn.stats.armor + worn.stats.health).toBeGreaterThan(0);

  const unequip = modal.getByRole('button', { name: `Unequip ${before.item.slot}` });
  await touchOrClick(page, unequip, test.info().project.name);
  await expect(modal.locator('.ashen-bag-item')).toHaveCount(1);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEquipmentCount
  ), { timeout: 10000 }).toBe('0');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenMaxHp
  ), { timeout: 10000 }).toBe('100');

  // Wear it again, then restart via the existing native defeat control.
  await touchOrClick(page, modal.getByRole('button', { name: /^Equip /i }), test.info().project.name);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEquipmentCount
  ), { timeout: 10000 }).toBe('1');
  await touchOrClick(page, modal.getByRole('button', { name: 'CLOSE' }), test.info().project.name);

  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      health: { hp: number; defeated: boolean };
      defeatOverlay: { show: () => void };
    };
    scene.health.hp = 0;
    scene.health.defeated = true;
    scene.defeatOverlay.show();
  });
  const restart = page.locator('#ashen-defeat-overlay').getByRole('button', { name: 'RESTART EXPEDITION' });
  await touchOrClick(page, restart, test.info().project.name);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEquipmentCount
  ), { timeout: 10000 }).toBe('0');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenBagCount
  ), { timeout: 10000 }).toBe('0');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenMaxHp
  ), { timeout: 10000 }).toBe('100');
  expect(errors).toEqual([]);
});
