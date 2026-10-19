import { test, expect, type Page, type Locator } from '@playwright/test';

const url = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function tap(page: Page, control: Locator) {
  await expect(control).toBeVisible({ timeout: 12_000 });
  if (test.info().project.name === 'desktop') {
    await control.click();
  } else {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
}

test('a clustered pile has one world icon and lets iPhone players choose each item', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);

  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      movement: { position: { x: number; y: number } };
      enemies: { hp: number; id: number; kind: string; position: { x: number; y: number } }[];
      roomEncounters: { guardianId: number };
    };
    // Real enemy deaths drive the normal drop bookkeeping.
    const brutes = scene.enemies.filter(enemy =>
      enemy.kind === 'brute' && enemy.id !== scene.roomEncounters.guardianId,
    ).slice(0, 2);
    if (brutes.length !== 2) throw new Error('Seed lacks two non-Warden brutes');
    brutes.forEach((enemy, index) => {
      enemy.position = {
        x: scene.movement.position.x + 30 + index * 15,
        y: scene.movement.position.y + index * 4,
      };
      enemy.hp = 0;
    });
  });

  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenGroundCount
  ), { timeout: 10_000 }).toBe('2');
  const initial = await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      loot: { ground: { id: string; item: { id: string; name: string } }[] };
      groundVisuals: Map<string, { list: { text?: string }[] }>;
    };
    const visuals = [...scene.groundVisuals.values()];
    return {
      ground: scene.loot.ground.map(drop => ({
        groundId: drop.id, itemId: drop.item.id, name: drop.item.name,
      })),
      visualCount: visuals.length,
      labels: visuals.flatMap(v => v.list.map(child => child.text).filter(Boolean)),
    };
  });
  expect(initial.visualCount).toBe(1);
  expect(initial.labels).toEqual(['×2']);
  expect(initial.ground).toHaveLength(2);
  for (const item of initial.ground) expect(initial.labels).not.toContain(item.name);

  const nearby = page.locator('#ashen-loot-nearby');
  await expect(nearby).toBeVisible();
  await expect(nearby.getByRole('button', { name: 'PICK UP' })).toBeVisible();
  await tap(page, nearby.getByRole('button', { name: 'VIEW 2 ITEMS' }));
  const picker = page.locator('#ashen-loot-picker-overlay');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.ashen-loot-picker-item')).toHaveCount(2);
  await expect(picker).toContainText('If equipped:');
  expect(await page.evaluate(() => document.documentElement.dataset.ashenBagCount)).toBe('0');

  const chosen = initial.ground[1];
  await tap(page, picker.getByRole('button', { name: `Take ${chosen.name}` }));
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenBagCount
  )).toBe('1');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenGroundCount
  )).toBe('1');
  await expect(picker.locator('.ashen-loot-picker-item')).toHaveCount(1);
  await expect(picker).toBeVisible();
  const current = await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      loot: { bag: { id: string }[]; ground: { item: { id: string } }[] };
      groundVisuals: Map<string, unknown>;
    };
    return {
      bagId: scene.loot.bag[0].id,
      groundId: scene.loot.ground[0].item.id,
      visuals: scene.groundVisuals.size,
    };
  });
  expect(current.bagId).toBe(chosen.itemId);
  expect(current.groundId).toBe(initial.ground[0].itemId);
  expect(current.visuals).toBe(1);

  await tap(page, picker.getByRole('button', { name: `Take ${initial.ground[0].name}` }));
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenBagCount
  )).toBe('2');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenGroundCount
  )).toBe('0');
  await expect(picker).toBeHidden();

  // The bag still contains both distinct item identities and mobile controls
  // behave as before; nothing became an invented combined "pile item."
  await tap(page, page.locator('#ashen-bag-toggle'));
  await expect(page.locator('#ashen-bag-overlay .ashen-bag-item')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('nearby loot picker can close without pickup and leaves every drop intact', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (name: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      loot: {
        dropForEnemy: (id: number, kind: string, guardian: boolean, pos: {x:number;y:number}) => unknown;
      };
      movement: { position: { x: number; y: number } };
      refreshGroundVisuals: () => void;
    };
    for (const [i, offset] of [25, 43].entries()) {
      scene.loot.dropForEnemy(500 + i, 'brute', false, {
        x: scene.movement.position.x + offset,
        y: scene.movement.position.y,
      });
    }
    scene.refreshGroundVisuals();
  });
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenGroundCount
  )).toBe('2');
  await tap(page, page.locator('#ashen-loot-nearby').getByRole('button', { name: 'VIEW 2 ITEMS' }));
  await expect(page.locator('#ashen-loot-picker-overlay')).toBeVisible();
  await tap(page, page.locator('#ashen-loot-picker-overlay').getByRole('button', { name: 'CLOSE' }));
  await expect(page.locator('#ashen-loot-picker-overlay')).toBeHidden();
  await expect(page.locator('#ashen-loot-nearby')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.ashenGroundCount)).toBe('2');
  expect(await page.evaluate(() => document.documentElement.dataset.ashenBagCount)).toBe('0');
});
