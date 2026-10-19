import { expect, test, type Locator, type Page } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function tap(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible({ timeout: 12_000 });
  if (test.info().project.name === 'desktop') {
    await control.click();
    return;
  }
  const rect = await control.boundingBox();
  expect(rect).not.toBeNull();
  await page.touchscreen.tap(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
}

/**
 * Use an actual ExpeditionLoot drop at a seeded extraction site, preserving
 * proximity, map generation, item IDs, bag capacity and save boundaries.
 * A live enemy needn't remain in the exit room to reproduce the UI collision.
 */
async function placeLootAtWaystone(page: Page, count = 1): Promise<void> {
  await page.evaluate((numberOfItems) => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } };
    };
    const scene = runtime.__ashenE2eGame?.scene.getScene('DungeonScene') as {
      extraction: { sites: { position: { x: number; y: number } }[] };
      movement: { position: { x: number; y: number }; stop: () => void };
      waypoints: { x: number; y: number }[];
      roomEncounters: { guardianId: number };
      enemies: { id: number; hp: number }[];
      loot: {
        dropForEnemy: (id: number, kind: string, guardian: boolean,
          point: { x: number; y: number }) => unknown;
      };
      refreshGroundVisuals: () => void;
    } | undefined;
    if (!scene) throw new Error('Dungeon scene unavailable');
    const position = scene.extraction.sites[0].position;
    for (const enemy of scene.enemies) {
      if (enemy.id !== scene.roomEncounters.guardianId) enemy.hp = 0;
    }
    scene.movement.stop();
    scene.waypoints = [];
    scene.movement.position = { ...position };
    for (let i = 0; i < numberOfItems; i++) {
      const drop = scene.loot.dropForEnemy(5000 + i, 'brute', false,
        { x: position.x + 12 + i * 7, y: position.y + 6 });
      if (!drop) throw new Error('Failed to create genuine Brute loot');
    }
    scene.refreshGroundVisuals();
  }, count);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenGroundCount,
  ), { timeout: 12_000 }).toBe(String(count));
  await expect(page.locator('#ashen-interaction-dock')).toBeVisible();
  await expect(page.locator('#ashen-interaction-tabs')).toHaveCount(0);
  await expect(page.locator('.ashen-interaction-tabs')).toBeVisible();
}

async function expectNoDockOverlap(page: Page): Promise<void> {
  const measurements = await page.evaluate(() => {
    const dock = document.getElementById('ashen-interaction-dock')!.getBoundingClientRect();
    const bag = document.getElementById('ashen-bag-toggle')!.getBoundingClientRect();
    const stash = document.getElementById('ashen-stash-toggle')!.getBoundingClientRect();
    const loot = document.getElementById('ashen-loot-nearby')!.getBoundingClientRect();
    const extract = document.getElementById('ashen-extraction-panel')!.getBoundingClientRect();
    const root = document.getElementById('ashen-interaction-dock')!;
    return {
      dock: { x: dock.x, y: dock.y, bottom: dock.bottom, right: dock.right },
      bagTop: bag.top,
      stashTop: stash.top,
      loot: { width: loot.width, height: loot.height },
      extract: { width: extract.width, height: extract.height },
      active: root.dataset.active,
      visiblePanels: [loot.width > 0 && loot.height > 0, extract.width > 0 && extract.height > 0]
        .filter(Boolean).length,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  expect(measurements.visiblePanels).toBe(1);
  expect(measurements.dock.bottom).toBeLessThan(measurements.bagTop);
  expect(measurements.dock.bottom).toBeLessThan(measurements.stashTop);
  expect(measurements.dock.y).toBeGreaterThanOrEqual(0);
  expect(measurements.dock.x).toBeGreaterThanOrEqual(0);
  expect(measurements.dock.right).toBeLessThanOrEqual(measurements.viewport.width);
}

test('loot dropped directly beside a waystone remains selectable on narrow iPhone screens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });

  await placeLootAtWaystone(page, 1);
  const dock = page.locator('#ashen-interaction-dock');
  await expect(dock).toHaveAttribute('data-active', 'loot');
  await expect(page.locator('#ashen-loot-nearby')).toBeVisible();
  await expect(page.locator('#ashen-extraction-panel')).toBeHidden();
  await expectNoDockOverlap(page);

  // The player can explicitly inspect the exit instead of guessing which
  // floating window is above the other.
  await tap(page, page.locator('#ashen-interaction-extract'));
  await expect(dock).toHaveAttribute('data-active', 'extract');
  await expect(page.locator('#ashen-extraction-panel')).toBeVisible();
  await expect(page.locator('#ashen-loot-nearby')).toBeHidden();
  await expectNoDockOverlap(page);

  await tap(page, page.locator('#ashen-interaction-loot'));
  await expect(page.locator('#ashen-loot-nearby')).toBeVisible();
  await tap(page, page.locator('#ashen-loot-nearby').getByRole('button', { name: 'PICK UP' }));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenBagCount,
  )).toBe('1');
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenGroundCount,
  )).toBe('0');

  // The waystone becomes the sole interaction as soon as the last nearby
  // item is collected; no stale tab or invisible panel blocks EXTRACT NOW.
  await expect(page.locator('.ashen-interaction-tabs')).toBeHidden();
  await expect(page.locator('#ashen-extraction-panel')).toBeVisible();
  await expectNoDockOverlap(page);
  await tap(page, page.locator('#ashen-extraction-panel').getByRole('button', { name: 'EXTRACT NOW' }));
  await expect(page.locator('#ashen-extraction-overlay')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#ashen-extraction-overlay')).toContainText('1 item secured');
  expect(errors).toEqual([]);
});

test('switching from a channelled waystone to loot cancels escape without collecting it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await placeLootAtWaystone(page, 2);
  await tap(page, page.locator('#ashen-interaction-extract'));
  const extraction = page.locator('#ashen-extraction-panel');
  await tap(page, extraction.getByRole('button', { name: 'EXTRACT NOW' }));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenExtractionPhase,
  )).toBe('channeling');
  await expect(page.locator('#ashen-interaction-dock')).toHaveAttribute('data-active', 'extract');
  await expect(extraction.getByRole('button', { name: 'CANCEL ESCAPE' })).toBeVisible();

  // Loot remains accessible as a tab, but selecting it always interrupts an
  // active extraction. No items are auto-picked or auto-saved.
  await tap(page, page.locator('#ashen-interaction-loot'));
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenExtractionPhase,
  )).toBe('idle');
  await expect(page.locator('#ashen-interaction-dock')).toHaveAttribute('data-active', 'loot');
  await expect(page.locator('#ashen-loot-nearby')).toBeVisible();
  await expect(page.locator('#ashen-loot-nearby').getByRole('button', { name: 'VIEW 2 ITEMS' })).toBeVisible();
  await expect(page.locator('#ashen-extraction-overlay')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.dataset.ashenGroundCount)).toBe('2');
  expect(await page.evaluate(() => document.documentElement.dataset.ashenStashCount)).toBe('0');

  await tap(page, page.locator('#ashen-loot-nearby').getByRole('button', { name: 'VIEW 2 ITEMS' }));
  const picker = page.locator('#ashen-loot-picker-overlay');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.ashen-loot-picker-item')).toHaveCount(2);
  await tap(page, picker.getByRole('button', { name: 'CLOSE' }));
  await expect(picker).toBeHidden();
  await expect(page.locator('#ashen-loot-nearby')).toBeVisible();
  await expectNoDockOverlap(page);

  await tap(page, page.locator('#ashen-interaction-extract'));
  await expect(extraction.getByRole('button', { name: 'EXTRACT NOW' })).toBeVisible();
  await tap(page, extraction.getByRole('button', { name: 'EXTRACT NOW' }));
  await expect(page.locator('#ashen-extraction-overlay')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#ashen-extraction-overlay')).toContainText('0 items secured');
});

test('short landscape view presents one touchable card with two non-overlapping tabs', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(gameUrl);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await placeLootAtWaystone(page, 2);
  await expectNoDockOverlap(page);
  await tap(page, page.locator('#ashen-interaction-extract'));
  await expectNoDockOverlap(page);
  await tap(page, page.locator('#ashen-interaction-loot'));
  await expectNoDockOverlap(page);
  const take = page.locator('#ashen-loot-nearby').getByRole('button', { name: 'PICK UP' });
  await tap(page, take);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.dataset.ashenBagCount,
  )).toBe('1');
});
