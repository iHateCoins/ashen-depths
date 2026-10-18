import { test, expect } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

interface ExplorationSnapshot {
  seed: number;
  roomsDiscovered: number;
  totalRooms: number;
  floorsExplored: number;
  totalFloors: number;
  cacheDiscovered: boolean;
}

async function readExploration(page: import('@playwright/test').Page): Promise<ExplorationSnapshot> {
  return page.evaluate(() => {
    const windowForTest = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = windowForTest.__ashenE2eGame?.scene.getScene('DungeonScene') as {
      dungeon: { seed: number; rooms: { id: number; role: string; center: {x:number;y:number} }[] };
      exploration: {
        roomsDiscovered: number; totalRooms: number;
        floorsExplored: number; totalFloors: number;
        hasDiscovered: (id: number) => boolean;
      };
    } | undefined;
    if (!scene?.dungeon || !scene.exploration) throw new Error('Exploration scene not initialized');
    const cache = scene.dungeon.rooms.find(room => room.role === 'cache');
    if (!cache) throw new Error('Cache chamber missing');
    return {
      seed: scene.dungeon.seed,
      roomsDiscovered: scene.exploration.roomsDiscovered,
      totalRooms: scene.exploration.totalRooms,
      floorsExplored: scene.exploration.floorsExplored,
      totalFloors: scene.exploration.totalFloors,
      cacheDiscovered: scene.exploration.hasDiscovered(cache.id),
    };
  });
}

test('fog and minimap record new rooms then clear progress on a fresh run', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(gameUrl);
  expect(response?.ok()).toBe(true);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);

  const start = await readExploration(page);
  expect(start.seed).toBe(42);
  expect(start.roomsDiscovered).toBe(1);
  expect(start.totalRooms).toBe(8);
  expect(start.cacheDiscovered).toBe(false);
  expect(start.floorsExplored).toBeGreaterThan(10);
  expect(start.floorsExplored).toBeLessThan(start.totalFloors);

  // Move the actual player object into the sealed cache to exercise the
  // scene's discovery-update pipeline, not a mocked room-discovery function.
  await page.evaluate(() => {
    const windowForTest = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = windowForTest.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      dungeon: { rooms: {role:string;center:{x:number;y:number}}[] };
      grid: { center: (cell:{x:number;y:number}) => {x:number;y:number} };
      movement: { position: {x:number;y:number}; stop: () => void };
      waypoints: {x:number;y:number}[];
    };
    const room = scene.dungeon.rooms.find(room => room.role === 'cache')!;
    scene.movement.stop();
    scene.waypoints = [];
    scene.movement.position = scene.grid.center(room.center);
  });
  await expect.poll(async () => (await readExploration(page)).roomsDiscovered, { timeout: 10000 }).toBe(2);
  const discovered = await readExploration(page);
  expect(discovered.cacheDiscovered).toBe(true);
  expect(discovered.floorsExplored).toBeGreaterThan(start.floorsExplored);
  expect(errors).toEqual([]);

  await page.reload();
  await expect(canvas).toBeVisible({ timeout: 20000 });
  const newRun = await readExploration(page);
  expect(newRun.seed).toBe(42);
  expect(newRun.roomsDiscovered).toBe(1);
  expect(newRun.cacheDiscovered).toBe(false);
  expect(errors).toEqual([]);
});

test('the minimap catches taps instead of accidentally navigating the underlying dungeon', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(gameUrl);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 20000 });
  const original = await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      movement: { position: {x:number;y:number}; destination: {x:number;y:number} | null };
    };
    return { position: { ...scene.movement.position }, destination: scene.movement.destination };
  });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const mapX = bounds!.x + bounds!.width - 80;
  const mapY = bounds!.y + 105;
  if (test.info().project.name === 'desktop') await page.mouse.click(mapX,mapY);
  else await page.touchscreen.tap(mapX,mapY);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      movement: { position: {x:number;y:number}; destination: {x:number;y:number} | null };
    };
    return { position: { ...scene.movement.position }, destination: scene.movement.destination };
  });
  expect(after).toEqual(original);
  expect(errors).toEqual([]);
});
