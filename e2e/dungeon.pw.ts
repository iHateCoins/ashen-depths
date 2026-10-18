import { test, expect } from '@playwright/test';

const gameUrl = 'http://127.0.0.1:4173/ashen-depths/?seed=42';

interface DungeonSnapshot {
  seed: number;
  rooms: { id: number; x: number; y: number; width: number; height: number }[];
  passages: { from: number; to: number }[];
  floorChecksum: number;
  entranceWalkable: boolean;
  world: { width: number; height: number };
}

async function snapshot(page: import('@playwright/test').Page): Promise<DungeonSnapshot> {
  return page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame?.scene.getScene('DungeonScene') as {
      dungeon: {
        seed: number;
        rooms: DungeonSnapshot['rooms'];
        passages: DungeonSnapshot['passages'];
        floors: Uint8Array;
        entrance: { x: number; y: number };
      };
      grid: {
        width: number; height: number;
        cellAt: (point: { x: number; y: number }) => { x: number; y: number };
        isWalkable: (cell: { x: number; y: number }) => boolean;
      };
    } | undefined;
    if (!scene?.dungeon || !scene.grid) throw new Error('Dungeon did not initialize');
    let floorChecksum = 0;
    for (let i = 0; i < scene.dungeon.floors.length; i++) {
      floorChecksum = (floorChecksum * 31 + scene.dungeon.floors[i] * (i + 1)) >>> 0;
    }
    return {
      seed: scene.dungeon.seed,
      rooms: scene.dungeon.rooms.map(room => ({
        id: room.id, x: room.x, y: room.y, width: room.width, height: room.height,
      })),
      passages: scene.dungeon.passages.map(p => ({ from: p.from, to: p.to })),
      floorChecksum,
      entranceWalkable: scene.grid.isWalkable(scene.grid.cellAt(scene.dungeon.entrance)),
      world: { width: scene.grid.width, height: scene.grid.height },
    };
  });
}

test('a seeded dungeon renders, remains reproducible, and accepts click/tap movement', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(gameUrl);
  expect(response?.ok()).toBe(true);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#boot-status')).toHaveCount(0);

  const first = await snapshot(page);
  expect(first.seed).toBe(42);
  expect(first.rooms).toHaveLength(8);
  expect(first.passages.length).toBeGreaterThanOrEqual(8);
  expect(first.entranceWalkable).toBe(true);
  expect(first.world).toEqual({ width: 2304, height: 1536 });

  const before = await page.evaluate(() => {
    const runtime = window as Window & {
      __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
    };
    const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
      movement: { position: { x: number; y: number } };
    };
    return { ...scene.movement.position };
  });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2 + 75;
  const y = bounds!.y + bounds!.height / 2 + 10;
  if (test.info().project.name === 'desktop') await page.mouse.click(x, y);
  else await page.touchscreen.tap(x, y);

  await expect.poll(async () => {
    const current = await page.evaluate(() => {
      const runtime = window as Window & {
        __ashenE2eGame?: { scene: { getScene: (key: string) => unknown } }
      };
      const scene = runtime.__ashenE2eGame!.scene.getScene('DungeonScene') as {
        movement: { position: { x: number; y: number } };
      };
      return scene.movement.position;
    });
    return Math.hypot(current.x - before.x, current.y - before.y);
  }, { timeout: 8000 }).toBeGreaterThan(4);

  await page.reload();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  expect(await snapshot(page)).toEqual(first);
  expect(errors).toEqual([]);
});
