import { test, expect, type Locator, type Page } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

async function activate(page: Page, control: Locator): Promise<void> {
  await expect(control).toBeVisible({ timeout: 12_000 });
  if (test.info().project.name === 'desktop') {
    await control.click();
  } else {
    const rect = await control.boundingBox();
    expect(rect).not.toBeNull();
    await page.touchscreen.tap(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  }
}

async function ready(page: Page): Promise<void> {
  const response = await page.goto(gameUrl);
  expect(response?.ok()).toBe(true);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);
}

async function travelToWaystone(page: Page, index = 0): Promise<void> {
  await page.evaluate((siteIndex) => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame?.scene.getScene('DungeonScene') as {
      extraction: { sites: { position: { x: number; y: number } }[] };
      enemies: { hp: number; id: number }[];
      roomEncounters: { guardianId: number };
      movement: { position: { x: number; y: number }; stop: () => void };
      waypoints: { x: number; y: number }[];
    } | undefined;
    if (!scene) throw new Error('Missing DungeonScene');
    const site = scene.extraction.sites[siteIndex];
    if (!site) throw new Error('Missing waystone');
    // Clear local enemies without killing the Warden. The test verifies
    // early escape does not require boss defeat or any cleared chamber.
    for (const enemy of scene.enemies) {
      if (enemy.id !== scene.roomEncounters.guardianId) enemy.hp = 0;
    }
    scene.movement.stop();
    scene.waypoints = [];
    scene.movement.position = { ...site.position };
  }, index);
  await expect(page.locator('#ashen-extraction-panel')).toBeVisible({ timeout: 10_000 });
}

test('early waystone extraction saves equipped/carried gear without fighting Warden', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  await ready(page);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenExitCount,
  )).toBe('2');
  await expect(page.locator('#ashen-extraction-panel')).toBeHidden();

  // Create a genuine Brute drop using the live enemy death bookkeeping.
  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      enemies: { id: number; kind: string; hp: number; position: { x: number; y: number } }[];
      roomEncounters: { guardianId: number };
      movement: { position: { x: number; y: number } };
    };
    const brute = scene.enemies.find(enemy =>
      enemy.id !== scene.roomEncounters.guardianId && enemy.kind === 'brute');
    if (!brute) throw new Error('Missing Brute');
    brute.position = { x: scene.movement.position.x + 40, y: scene.movement.position.y };
    brute.hp = 0;
  });
  await expect(page.locator('#ashen-loot-nearby')).toBeVisible();
  await activate(page, page.locator('#ashen-loot-nearby').getByRole('button', { name: 'PICK UP' }));
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenBagCount,
  )).toBe('1');
  await activate(page, page.locator('#ashen-bag-toggle'));
  await activate(page, page.locator('#ashen-bag-overlay').getByRole('button', { name: /^Equip /i }));
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEquipmentCount,
  )).toBe('1');
  await activate(page, page.locator('#ashen-bag-overlay').getByRole('button', { name: 'CLOSE' }));

  await travelToWaystone(page, 0);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEncounter,
  )).toBe('explore');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenGuardianAlive,
  )).toBe('true');

  const start = page.locator('#ashen-extraction-panel').getByRole('button', { name: 'EXTRACT NOW' });
  await activate(page, start);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenExtractionPhase,
  )).toBe('channeling');
  await expect(page.locator('#ashen-extraction-panel')).toContainText('Channeling escape');

  const exitResult = page.locator('#ashen-extraction-overlay');
  await expect(exitResult).toBeVisible({ timeout: 15_000 });
  await expect(exitResult).toContainText('ESCAPED ALIVE');
  await expect(exitResult).toContainText('1 item secured');
  await expect(page.locator('#ashen-victory-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenStashCount,
  )).toBe('1');

  await activate(page, exitResult.getByRole('button', { name: 'NEW EXPEDITION' }));
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEncounter,
  )).toBe('explore');
  await expect(page.locator('#ashen-stash-toggle')).toContainText('STASH 1');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenBagCount,
  )).toBe('0');
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenEquipmentCount,
  )).toBe('0');
  expect(errors).toEqual([]);
});

test('waystone escape is deliberate and can be interrupted and cancelled without saving', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  await ready(page);
  await travelToWaystone(page, 1);
  const panel = page.locator('#ashen-extraction-panel');
  await expect(panel.getByRole('button', { name: 'EXTRACT NOW' })).toBeEnabled();

  // Standing in the waystone does not auto-extract, even if we wait longer
  // than an actual uninterrupted channel.
  await page.waitForTimeout(2800);
  expect(await page.evaluate(() => document.documentElement.dataset.ashenExtractionPhase)).toBe('idle');
  await expect(page.locator('#ashen-extraction-overlay')).toBeHidden();

  await activate(page, panel.getByRole('button', { name: 'EXTRACT NOW' }));
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenExtractionPhase,
  )).toBe('channeling');
  await activate(page, panel.getByRole('button', { name: 'CANCEL ESCAPE' }));
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenExtractionPhase,
  )).toBe('idle');
  await expect(page.locator('#ashen-extraction-overlay')).toBeHidden();

  await activate(page, panel.getByRole('button', { name: 'EXTRACT NOW' }));
  // Moving out of range must interrupt an active channel.
  await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      extraction: { sites: { position: { x: number; y: number } }[] };
      movement: { position: { x: number; y: number } };
    };
    const location = scene.extraction.sites[1].position;
    scene.movement.position = { x: location.x + 200, y: location.y };
  });
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenExtractionPhase,
  )).toBe('idle');
  await expect(page.locator('#ashen-extraction-overlay')).toBeHidden();
  await expect(page.locator('#ashen-stash-toggle')).toContainText('STASH 0');
  expect(errors).toEqual([]);
});

test('interrupted or failed-save early extraction cannot secure gear twice', async ({ page }) => {
  await ready(page);
  await travelToWaystone(page, 0);
  await page.evaluate(() => {
    const proto = Storage.prototype as Storage & { __priorSetItem?: typeof Storage.prototype.setItem };
    proto.__priorSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(): void { throw new Error('storage blocked'); };
  });
  await activate(page, page.locator('#ashen-extraction-panel').getByRole('button', { name: 'EXTRACT NOW' }));
  await expect(page.locator('#ashen-extraction-panel')).toContainText('On-device save failed', { timeout: 15000 });
  await expect(page.locator('#ashen-extraction-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.dataset.ashenExtractionPhase,
  )).toBe('idle');

  await page.evaluate(() => {
    const proto = Storage.prototype as Storage & { __priorSetItem?: typeof Storage.prototype.setItem };
    Storage.prototype.setItem = proto.__priorSetItem!;
    delete proto.__priorSetItem;
  });
  await activate(page, page.locator('#ashen-extraction-panel').getByRole('button', { name: 'EXTRACT NOW' }));
  await expect(page.locator('#ashen-extraction-overlay')).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => {
    const raw = localStorage.getItem('ashen-depths-stash-v1');
    return raw ? JSON.parse(raw).completed : null;
  })).toBe(1);
});
