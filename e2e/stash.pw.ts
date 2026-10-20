import { test, expect, type Locator, type Page } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function tap(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible({ timeout: 10000 });
  // Tall item cards can push Withdraw below the visible scrollable stash
  // panel, particularly in landscape and iPhone Safari. A raw (x,y) touch
  // never scrolls and may silently hit a different element.
  await control.scrollIntoViewIfNeeded();
  if (test.info().project.name === 'desktop') {
    await control.click();
  } else {
    await control.tap(); // Performs actionability checks and targets the real button.
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

  // Boss loot is now secured and visible in the following expedition.
  // Withdrawal and reload are tested independently below, with known
  // localStorage fixtures, so this test cannot accidentally hide a problem
  // behind unrelated combat or a later browser navigation.
  expect(errors).toEqual([]);
});

test('secured stash withdrawal persists once, enters risky bag, and stays withdrawn after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    // Playwright init scripts also run on reload: seed only once per
    // browsing context or the reload would silently recreate withdrawn gear.
    if (sessionStorage.getItem('ashen-e2e-stash-seeded')) return;
    sessionStorage.setItem('ashen-e2e-stash-seeded', '1');
    localStorage.setItem('ashen-depths-stash-v1', JSON.stringify({
      schema: 1, revision: 2, completed: 1, unlocks: [], forgeEmbers: 0,
      items: [
        {
          id: 'stash-old-weapon', name: 'Weathered Iron Cleaver', baseName: 'Iron Cleaver',
          rarity: 'magic', slot: 'weapon', itemLevel: 5,
          affixes: [{ id: 'sharp', label: 'Attack Power', value: 7 }],
        },
        {
          id: 'stash-old-armor', name: 'Old Ward Plate', baseName: 'Ward Plate',
          rarity: 'rare', slot: 'armor', itemLevel: 8,
          affixes: [
            { id: 'sturdy', label: 'Armor', value: 6 },
            { id: 'vital', label: 'Maximum Health', value: 8 },
          ],
        },
      ],
    }));
  });
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#boot-status')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator('#ashen-stash-toggle')).toContainText('STASH 2');
  expect(await page.evaluate(() => document.documentElement.dataset.ashenStashStatus)).toBe('ready');

  await page.evaluate(() => {
    const game = (window as any).__ashenE2eGame;
    const scene = game.scene.getScene('DungeonScene') as any;
    for (const enemy of scene.enemies) {
      enemy.position = { x: -2000 - enemy.id * 30, y: -2000 };
    }
    scene.movement.stop();
  });

  await tap(page, page.locator('#ashen-stash-toggle'));
  const vault = page.locator('#ashen-stash-overlay');
  await expect(vault).toBeVisible();
  await expect(vault.locator('.ashen-stash-item')).toHaveCount(2);
  const withdraw = vault.getByRole('button', { name: 'Withdraw Weathered Iron Cleaver' });
  await expect(withdraw).toBeEnabled();
  await tap(page, withdraw);

  // The durable save is authoritative, rather than a delayed HUD data flag.
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('ashen-depths-stash-v1');
    return raw ? JSON.parse(raw).items.map((item: { id: string }) => item.id) : [];
  })).toEqual(['stash-old-armor']);
  await expect.poll(() => page.evaluate(() => {
    const scene = (window as any).__ashenE2eGame.scene.getScene('DungeonScene') as any;
    return scene.loot.bag.map((item: { id: string }) => item.id);
  })).toEqual(['stash-old-weapon']);
  await expect(vault.locator('.ashen-stash-item')).toHaveCount(1);
  await tap(page, vault.getByRole('button', { name: 'CLOSE' }));
  await expect(vault).toBeHidden();
  await expect(page.locator('#ashen-stash-toggle')).toContainText('STASH 1');
  await expect(page.locator('#ashen-bag-toggle')).toContainText('BAG 1');

  // Real reload in the same browsing context: pending loot is lost,
  // secured items remain. The fixture explicitly does not reseed on reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-status')).toHaveCount(0, { timeout: 25000 });
  await expect(page.locator('#ashen-stash-toggle')).toBeVisible({ timeout: 25000 });
  await expect(page.locator('#ashen-stash-toggle')).toContainText('STASH 1');
  await expect(page.locator('#ashen-bag-toggle')).toContainText('BAG 0');
  await tap(page, page.locator('#ashen-stash-toggle'));
  await expect(page.locator('#ashen-stash-overlay .ashen-stash-item')).toHaveCount(1);
  await expect(page.locator('#ashen-stash-overlay')).toContainText('Old Ward Plate');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!));
  expect(saved.items.map((item: { id: string }) => item.id)).toEqual(['stash-old-armor']);
  expect(errors).toEqual([]);
});

test('failed withdrawal warns the player and never places unsecured gear in the bag', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ashen-depths-stash-v1', JSON.stringify({
      schema: 1, revision: 1, completed: 1, items: [{
        id: 'save-safe-weapon', name: 'Stored Iron Cleaver', baseName: 'Iron Cleaver',
        rarity: 'magic', slot: 'weapon', itemLevel: 5,
        affixes: [{ id: 'sharp', label: 'Attack Power', value: 7 }],
      }],
    }));
  });
  await page.goto(url);
  await expect(page.locator('#boot-status')).toHaveCount(0, { timeout: 20000 });
  await tap(page, page.locator('#ashen-stash-toggle'));
  const vault = page.locator('#ashen-stash-overlay');
  await expect(vault.locator('.ashen-stash-item')).toHaveCount(1);
  await page.evaluate(() => {
    const proto = Storage.prototype as Storage & { __originalSave?: typeof Storage.prototype.setItem };
    proto.__originalSave = Storage.prototype.setItem;
    Storage.prototype.setItem = function(): void { throw new Error('quota'); };
  });
  await tap(page, vault.getByRole('button', { name: 'Withdraw Stored Iron Cleaver' }));
  await expect(vault).toContainText('Withdrawal not completed — stash unchanged');
  await expect(vault.locator('.ashen-stash-item')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__ashenE2eGame.scene.getScene('DungeonScene').loot.bag.length)).toBe(0);
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!).items.length)).toBe(1);
  await page.evaluate(() => {
    const proto = Storage.prototype as Storage & { __originalSave?: typeof Storage.prototype.setItem };
    Storage.prototype.setItem = proto.__originalSave!;
    delete proto.__originalSave;
  });
  await tap(page, vault.getByRole('button', { name: 'Withdraw Stored Iron Cleaver' }));
  await expect(vault.locator('.ashen-stash-item')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__ashenE2eGame.scene.getScene('DungeonScene').loot.bag.length)).toBe(1);
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem('ashen-depths-stash-v1')!).items.length)).toBe(0);
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
  await expect(page.locator('#ashen-loot-nearby')).toContainText('RARE');
  await tap(page, page.locator('#ashen-loot-nearby').getByRole('button', { name: 'PICK UP' }));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenBagCount
  )).toBe('1');
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
  expect(await page.evaluate(() => document.documentElement.dataset.ashenBagCount)).toBe('1');

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
