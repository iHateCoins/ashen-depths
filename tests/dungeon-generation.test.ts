import { describe, expect, it } from 'vitest';
import {
  createDungeonNavigationGrid, DUNGEON_COLUMNS, DUNGEON_ROWS,
  dungeonFloorAt, dungeonSeedFromSearch, generateDungeon,
} from '../src/game/dungeon/DungeonGenerator';
import { findPath } from '../src/game/navigation/Pathfinder';

function visitedFloorCount(seed: number): { floorCount: number; reachable: number } {
  const dungeon = generateDungeon(seed);
  const grid = createDungeonNavigationGrid(dungeon);
  const entrance = grid.cellAt(dungeon.entrance);
  const queue = [entrance];
  const visited = new Set<string>([grid.key(entrance)]);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    for (const neighbor of [
      { x: cell.x + 1, y: cell.y }, { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 }, { x: cell.x, y: cell.y - 1 },
    ]) {
      const key = grid.key(neighbor);
      if (!visited.has(key) && grid.isWalkable(neighbor)) {
        visited.add(key);
        queue.push(neighbor);
      }
    }
  }
  const floorCount = dungeon.floors.reduce((sum, tile) => sum + tile, 0);
  return { floorCount, reachable: visited.size };
}

describe('seeded connected dungeons', () => {
  it('produces identical rooms, passages and floor tiles from the same seed', () => {
    const one = generateDungeon(123456);
    const two = generateDungeon(123456);
    expect(one.rooms).toEqual(two.rooms);
    expect(one.passages).toEqual(two.passages);
    expect(one.floors).toEqual(two.floors);
    expect(one.entrance).toEqual(two.entrance);
    expect(one.depth).toEqual(two.depth);
  });

  it('changes the layout with the seed', () => {
    const one = generateDungeon(1);
    const two = generateDungeon(2);
    expect(one.rooms).not.toEqual(two.rooms);
    expect(one.floors).not.toEqual(two.floors);
  });

  it('keeps every floor tile connected across different seeds', () => {
    for (const seed of [0, 1, 2, 3, 7, 17, 42, 1234, 65535, 0xFFFFFFFF]) {
      const result = visitedFloorCount(seed);
      expect(result.floorCount).toBeGreaterThan(400);
      expect(result.reachable).toBe(result.floorCount);
    }
  });

  it('generates eight distinct chambers with a branch and at least one navigable loop', () => {
    for (const seed of [0, 1, 7, 42, 9001]) {
      const layout = generateDungeon(seed);
      expect(layout.rooms).toHaveLength(8);
      expect(new Set(layout.rooms.map(room => room.id)).size).toBe(8);
      expect(layout.rooms.filter(room => room.role === 'entrance')).toHaveLength(1);
      expect(layout.rooms.filter(room => room.role === 'cache')).toHaveLength(1);
      expect(layout.rooms.filter(room => room.role === 'depth')).toHaveLength(1);
      expect(layout.passages.length).toBeGreaterThanOrEqual(layout.rooms.length);
      expect(layout.rooms.some(room =>
        layout.passages.filter(p => p.from === room.id || p.to === room.id).length >= 3
      )).toBe(true);
    }
  });

  it('keeps boundaries solid and room centers traversable', () => {
    const layout = generateDungeon(2026);
    expect(layout.floors).toHaveLength(DUNGEON_COLUMNS * DUNGEON_ROWS);
    for (let x = 0; x < DUNGEON_COLUMNS; x++) {
      expect(dungeonFloorAt(layout, { x, y: 0 })).toBe(false);
      expect(dungeonFloorAt(layout, { x, y: DUNGEON_ROWS - 1 })).toBe(false);
    }
    for (let y = 0; y < DUNGEON_ROWS; y++) {
      expect(dungeonFloorAt(layout, { x: 0, y })).toBe(false);
      expect(dungeonFloorAt(layout, { x: DUNGEON_COLUMNS - 1, y })).toBe(false);
    }
    const grid = createDungeonNavigationGrid(layout);
    for (const room of layout.rooms) {
      expect(grid.isWalkable(room.center)).toBe(true);
      expect(findPath(grid, layout.entrance, grid.center(room.center))).not.toBeNull();
    }
    expect(grid.isSegmentWalkable(layout.entrance, layout.depth)).toBe(false);
  });

  it('supports a reproducible URL seed and otherwise generates a fresh seed', () => {
    const random = () => 2735;
    expect(dungeonSeedFromSearch('?seed=42&build=abc', random)).toBe(42);
    expect(dungeonSeedFromSearch('?seed=4294967295', random)).toBe(0xFFFFFFFF);
    expect(dungeonSeedFromSearch('?seed=4294967296', random)).toBe(2735);
    expect(dungeonSeedFromSearch('?seed=-1', random)).toBe(2735);
    expect(dungeonSeedFromSearch('?seed=garbage', random)).toBe(2735);
    expect(dungeonSeedFromSearch('', random)).toBe(2735);
  });

  it('rejects a non-finite seed', () => {
    expect(() => generateDungeon(Number.NaN)).toThrow();
    expect(() => generateDungeon(Infinity)).toThrow();
  });
});
