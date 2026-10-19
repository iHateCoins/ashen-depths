import { test, expect } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

test('enemy drops real loot, pickup/inspect/discard use mobile touch and restart loses unsecured bag', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(gameUrl);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);

  // Defeat a real Brute near the character. The live scene's enemy-death
  // bookkeeping must create the drop; tests never invent bag entries.
  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      movement: { position: {x:number;y:number} };
      enemies: { id:number;kind:string;hp:number;position:{x:number;y:number} }[];
      roomEncounters: { guardianId: number };
    };
    const brute = scene.enemies.find(enemy =>
      enemy.kind === 'brute' && enemy.id !== scene.roomEncounters.guardianId);
    if (!brute) throw new Error('Expected a Brute in the generated dungeon');
    brute.position = { x: scene.movement.position.x + 40, y: scene.movement.position.y + 8 };
    brute.hp = 0;
  });

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenGroundCount),
    { timeout: 10000 }).toBe('1');
  const pickup = page.locator('#ashen-loot-nearby').getByRole('button', { name: 'PICK UP' });
  await expect(pickup).toBeVisible();
  if (test.info().project.name === 'desktop') await pickup.click();
  else {
    await pickup.scrollIntoViewIfNeeded();
    const rect = await pickup.boundingBox();
    expect(rect).not.toBeNull();
    await page.touchscreen.tap(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  }

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenBagCount),
    { timeout: 10000 }).toBe('1');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenGroundCount),
    { timeout: 10000 }).toBe('0');

  const bagButton = page.getByRole('button', { name: 'BAG 1 / 24' });
  await expect(bagButton).toBeVisible();
  if (test.info().project.name === 'desktop') await bagButton.click();
  else {
    await bagButton.scrollIntoViewIfNeeded();
    const rect = await bagButton.boundingBox();
    expect(rect).not.toBeNull();
    await page.touchscreen.tap(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  }

  const modal = page.locator('#ashen-bag-overlay');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('UNSECURED LOOT');
  await expect(modal.locator('.ashen-bag-item')).toHaveCount(1);
  await expect(modal.locator('.ashen-bag-item .ashen-bag-item-details')).toContainText(/(weapon|armor|charm)/i);

  // Native item drop button frees the slot, without duplicating the item.
  const discard = modal.getByRole('button', { name: /^Drop /i });
  await expect(discard).toBeVisible();
  if (test.info().project.name === 'desktop') await discard.click();
  else {
    await discard.scrollIntoViewIfNeeded();
    const rect = await discard.boundingBox();
    expect(rect).not.toBeNull();
    await page.touchscreen.tap(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  }
  await expect(modal.locator('.ashen-bag-item')).toHaveCount(0);
  const close = modal.getByRole('button', { name: 'CLOSE' });
  if (test.info().project.name === 'desktop') await close.click();
  else {
    await close.scrollIntoViewIfNeeded();
    const rect = await close.boundingBox();
    expect(rect).not.toBeNull();
    await page.touchscreen.tap(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  }

  await expect(pickup).toBeVisible();
  if (test.info().project.name === 'desktop') await pickup.click();
  else {
    await pickup.scrollIntoViewIfNeeded();
    const rect = await pickup.boundingBox();
    expect(rect).not.toBeNull();
    await page.touchscreen.tap(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenBagCount),
    { timeout: 10000 }).toBe('1');

  // Defeat and restart uses the existing proven accessible button.
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
  await expect(restart).toBeVisible();
  if (test.info().project.name === 'desktop') await restart.click();
  else {
    const rect = await restart.boundingBox();
    expect(rect).not.toBeNull();
    await page.touchscreen.tap(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenBagCount),
    { timeout: 10000 }).toBe('0');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenGroundCount),
    { timeout: 10000 }).toBe('0');
  await expect(page.locator('#ashen-bag-toggle')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Warden rare drop remains collectible before player chooses to finish the expedition', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      movement: { position: { x: number; y: number } };
      roomEncounters: { guardianId: number; hasEnteredDepth: boolean };
      enemies: { id: number; hp: number; position: { x: number; y: number } }[];
    };
    const guardian = scene.enemies.find(enemy => enemy.id === scene.roomEncounters.guardianId);
    if (!guardian) throw new Error('The Warden is missing');
    guardian.position = { x: scene.movement.position.x + 38, y: scene.movement.position.y };
    guardian.hp = 0;
    scene.roomEncounters.hasEnteredDepth = true;
  });

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenEncounter),
    { timeout: 10000 }).toBe('complete');
  await expect(page.getByRole('button', { name: 'FINISH EXPEDITION' })).toBeVisible();
  const rare = page.locator('#ashen-loot-nearby');
  await expect(rare).toBeVisible();
  await expect(rare).toContainText('RARE');

  const pickup = rare.getByRole('button', { name: 'PICK UP' });
  if (test.info().project.name === 'desktop') await pickup.click();
  else {
    await pickup.scrollIntoViewIfNeeded();
    const box = await pickup.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.ashenBagCount),
    { timeout: 10000 }).toBe('1');

  const finish = page.getByRole('button', { name: 'FINISH EXPEDITION' });
  if (test.info().project.name === 'desktop') await finish.click();
  else {
    await finish.scrollIntoViewIfNeeded();
    const box = await finish.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
  await expect(page.locator('#ashen-victory-overlay')).toBeVisible();
  expect(errors).toEqual([]);
});
