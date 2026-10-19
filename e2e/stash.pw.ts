import { test, expect, type Locator, type Page } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function tap(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible({ timeout: 10000 });
  await control.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') {
    await control.click();
  } else {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
}

async function defeatEnemyNearPlayer(page: Page, guardian: boolean): Promise<void> {
  await page.evaluate((killWarden) => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      movement: { position: { x: number; y: number } };
      roomEncounters: { guardianId: number; hasEnteredDepth: boolean };
      enemies: { id: number; kind: string; hp: number; position: { x: number; y: number } }[];
    };
    const opponent = killWarden
      ? scene.enemies.find(enemy => enemy.id === scene.roomEncounters.guardianId)
      : scene.enemies.find(enemy =>
          enemy.kind === 'brute' && enemy.id !== scene.roomEncounters.guardianId);
    if (!opponent) throw new Error('Expected live enemy');
    opponent.position = {
      x: scene.movement.position.x + 40,
      y: scene.movement.position.y + 8,
    };
    opponent.hp = 0;
    if (killWarden) scene.roomEncounters.hasEnteredDepth = true;
  }, guardian);
}

test('Warden finish saves carried and equipped loot across restarts and page reloads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(url);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);
  await expect(page.locator('#ashen-stash-toggle')).toContainText('STASH 0');
  expect(await page.evaluate(() => document.documentElement.dataset.ashenStashStatus)).toBe('ready');

  await defeatEnemyNearPlayer(page, false);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenGroundCount
  ), { timeout: 10000 }).toBe('1');
  await tap(page, page.locator('#ashen-loot-nearby').getByRole('button', { name: 'PICK UP' }));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenBagCount
  )).toBe('1');

  await tap(page, page.locator('#ashen-bag-toggle'));
  await tap(page, page.locator('#ashen-bag-overlay').getByRole('button', { name: /^Equip /i }));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenEquipmentCount
  )).toBe('1');
  await tap(page, page.locator('#ashen-bag-overlay').getByRole('button', { name: 'CLOSE' }));

  await defeatEnemyNearPlayer(page, true);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenEncounter
  ), { timeout: 10000 }).toBe('complete');
  await expect(page.locator('#ashen-loot-nearby')).toContainText('RARE');
  await tap(page, page.locator('#ashen-loot-nearby').getByRole('button', { name: 'PICK UP' }));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenBagCount
  )).toBe('1');

  await tap(page, page.getByRole('button', { name: 'FINISH EXPEDITION' }));
  const result = page.locator('#ashen-victory-overlay');
  await expect(result).toBeVisible();
  await expect(result).toContainText('2 items secured');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenStashCount
  )).toBe('2');

  await tap(page, result.getByRole('button', { name: 'NEW EXPEDITION' }));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenEncounter
  )).toBe('explore');
  await expect(page.locator('#ashen-stash-toggle')).toContainText('STASH 2');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenBagCount
  )).toBe('0');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenEquipmentCount
  )).toBe('0');

  await tap(page, page.locator('#ashen-stash-toggle'));
  const vault = page.locator('#ashen-stash-overlay');
  await expect(vault).toBeVisible();
  await expect(vault.locator('.ashen-stash-item')).toHaveCount(2);
  await expect(vault).toContainText('1 successful expedition');
  const withdraw = vault.getByRole('button', { name: /^Withdraw /i }).first();
  await expect(withdraw).toBeEnabled();
  await tap(page, withdraw);
  await expect(vault.locator('.ashen-stash-item')).toHaveCount(1);
  await tap(page, vault.getByRole('button', { name: 'CLOSE' }));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenStashCount
  )).toBe('1');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenBagCount
  )).toBe('1');

  // A withdrawal is intentionally unsecured: reloading without extraction
  // cannot duplicate the item back into persistent storage.
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#ashen-stash-toggle')).toContainText('STASH 1');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenBagCount
  )).toBe('0');
  await tap(page, page.locator('#ashen-stash-toggle'));
  await expect(page.locator('.ashen-stash-item')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('failed stash save leaves Finish action usable and does not fake victory', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await defeatEnemyNearPlayer(page, true);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenEncounter
  )).toBe('complete');
  // Simulate a quota/privacy rejection inside the same browser session.
  await page.evaluate(() => {
    const prototype = Storage.prototype as Storage & { __priorSetItem?: typeof Storage.prototype.setItem };
    prototype.__priorSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(): void { throw new Error('quota'); };
  });
  const finish = page.getByRole('button', { name: 'FINISH EXPEDITION' });
  await tap(page, finish);
  await expect(page.locator('#ashen-finish-warning')).toBeVisible();
  await expect(page.locator('#ashen-victory-overlay')).toBeHidden();
  await expect(finish).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ashen-depths-stash-v1'))).toBeNull();

  await page.evaluate(() => {
    const prototype = Storage.prototype as Storage & { __priorSetItem?: typeof Storage.prototype.setItem };
    Storage.prototype.setItem = prototype.__priorSetItem!;
    delete prototype.__priorSetItem;
  });
  await tap(page, finish);
  await expect(page.locator('#ashen-victory-overlay')).toBeVisible();
  await expect(page.locator('#ashen-victory-overlay')).toContainText('1 item secured');
  expect(errors).toEqual([]);
});
