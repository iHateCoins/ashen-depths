import { describe, expect, it } from 'vitest';
import { NavigationGrid } from '../src/game/navigation/Grid';
import { createDungeonNavigationGrid, generateDungeon, type DungeonLayout } from '../src/game/dungeon/DungeonGenerator';
import { ExplorationTracker } from '../src/game/dungeon/ExplorationTracker';

describe('run-scoped dungeon exploration', () => {
  it('reveals only a local fraction of the map when the run begins', () => {
    const dungeon = generateDungeon(42);
    const grid = createDungeonNavigationGrid(dungeon);
    const tracker = new ExplorationTracker(dungeon, grid);
    const first = tracker.update(dungeon.entrance);
    expect(first.movedCell).toBe(true);
    expect(first.revealed).toBeGreaterThan(0);
    expect(tracker.roomsDiscovered).toBe(1);
    expect(tracker.hasDiscovered(4)).toBe(true);
    expect(tracker.floorsExplored).toBeLessThan(tracker.totalFloors);
    expect(tracker.hasSeen(grid.cellAt(dungeon.depth))).toBe(false);
    expect(tracker.discoveryPercent).toBe(13);
  });

  it('discovery advances only on physically entering new chambers', () => {
    const dungeon = generateDungeon(1234);
    const grid = createDungeonNavigationGrid(dungeon);
    const tracker = new ExplorationTracker(dungeon, grid);
    tracker.update(dungeon.entrance);
    const cache = dungeon.rooms.find(room => room.role === 'cache')!;
    const cachePosition = grid.center(cache.center);
    expect(tracker.hasDiscovered(cache.id)).toBe(false);
    const entry = tracker.update(cachePosition);
    expect(entry.discovered).toEqual([{ id: cache.id, role: 'cache' }]);
    expect(tracker.roomsDiscovered).toBe(2);
    expect(tracker.update(cachePosition)).toEqual({ revealed: 0, discovered: [], movedCell: false });
    expect(tracker.roomsDiscovered).toBe(2);
    const revisit = tracker.update(dungeon.entrance);
    expect(revisit.discovered).toEqual([]);
    expect(tracker.roomsDiscovered).toBe(2);
  });

  it('can discover all eight chambers without double counting or revealing rock', () => {
    for (const seed of [0, 1, 42, 2026]) {
      const dungeon = generateDungeon(seed);
      const grid = createDungeonNavigationGrid(dungeon);
      const tracker = new ExplorationTracker(dungeon, grid);
      for (const room of dungeon.rooms) tracker.update(grid.center(room.center));
      expect(tracker.roomsDiscovered).toBe(8);
      expect(tracker.discoveryPercent).toBe(100);
      expect(tracker.floorsExplored).toBeLessThanOrEqual(tracker.totalFloors);
      for (let index = 0; index < dungeon.floors.length; index++) {
        if (!dungeon.floors[index]) expect(tracker.revealed[index]).toBe(0);
      }
    }
  });

  it('has different per-run progress even for the same seed', () => {
    const dungeon = generateDungeon(42);
    const grid = createDungeonNavigationGrid(dungeon);
    const first = new ExplorationTracker(dungeon, grid);
    const second = new ExplorationTracker(dungeon, grid);
    first.update(dungeon.entrance);
    first.update(grid.center(dungeon.rooms.find(room => room.role === 'cache')!.center));
    second.update(dungeon.entrance);
    expect(first.roomsDiscovered).toBe(2);
    expect(second.roomsDiscovered).toBe(1);
  });

  it('does not reveal floor on the opposite side of a blocking wall', () => {
    const grid = new NavigationGrid(320, 320, 32);
    const floors = new Uint8Array(100);
    // A walkable loop routes around the wall, but line-of-sight from the first
    // room to the second must still be obstructed.
    for (const cell of [
      {x:2,y:2},{x:2,y:3},{x:2,y:4},{x:3,y:4},
      {x:4,y:4},{x:4,y:3},{x:4,y:2},
    ]) floors[cell.y * 10 + cell.x] = 1;
    for (let y=0;y<10;y++) for(let x=0;x<10;x++) grid.setBlocked({x,y},floors[y*10+x]!==1);
    const dungeon: DungeonLayout = {
      seed: 1, columns: 10, rows: 10, cellSize: 32, floors,
      rooms: [
        {id:0,x:2,y:2,width:1,height:2,center:{x:2,y:2},role:'entrance'},
        {id:1,x:4,y:2,width:1,height:2,center:{x:4,y:2},role:'depth'},
      ],
      passages: [{from:0,to:1,bend:'horizontal-first'}],
      entrance:grid.center({x:2,y:2}), depth:grid.center({x:4,y:2}),
    };
    const tracker = new ExplorationTracker(dungeon,grid,5);
    tracker.update(dungeon.entrance);
    expect(tracker.hasSeen({x:2,y:2})).toBe(true);
    expect(tracker.hasSeen({x:4,y:2})).toBe(false);
    expect(tracker.hasDiscovered(1)).toBe(false);
    tracker.update(grid.center({x:4,y:2}));
    expect(tracker.hasDiscovered(1)).toBe(true);
  });

  it('ignores invalid player locations and rejects bad visibility radius', () => {
    const dungeon = generateDungeon(77);
    const grid = createDungeonNavigationGrid(dungeon);
    const tracker = new ExplorationTracker(dungeon,grid);
    expect(tracker.update({x:Number.NaN,y:42}).movedCell).toBe(false);
    expect(tracker.update({x:0,y:0}).movedCell).toBe(false);
    expect(tracker.roomsDiscovered).toBe(0);
    expect(() => new ExplorationTracker(dungeon,grid,0)).toThrow();
  });
});
