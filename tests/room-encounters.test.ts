import { describe, expect, it } from 'vitest';
import { createDungeonNavigationGrid, generateDungeon } from '../src/game/dungeon/DungeonGenerator';
import { findPath } from '../src/game/navigation/Pathfinder';
import { planRoomEncounters, RoomEncounterDirector } from '../src/game/combat/RoomEncounterDirector';

describe('room-based enemy populations', () => {
  it('is stable for the same dungeon seed and varies between seeds', () => {
    const first = generateDungeon(42);
    const grid = createDungeonNavigationGrid(first);
    const one = planRoomEncounters(first, grid);
    const two = planRoomEncounters(generateDungeon(42), createDungeonNavigationGrid(generateDungeon(42)));
    expect(one).toEqual(two);
    const other = generateDungeon(43);
    expect(one).not.toEqual(planRoomEncounters(other, createDungeonNavigationGrid(other)));
  });

  it('spawns enemies in each nonentrance room on valid, reachable floor', () => {
    for (const seed of [0, 1, 7, 42, 2026, 0xFFFFFFFF]) {
      const dungeon = generateDungeon(seed);
      const grid = createDungeonNavigationGrid(dungeon);
      const placements = planRoomEncounters(dungeon, grid);
      const roomsWithEnemies = new Set(placements.map(spawn => spawn.roomId));
      expect(roomsWithEnemies.size).toBe(dungeon.rooms.length - 1);
      expect(roomsWithEnemies.has(4)).toBe(false);
      expect(new Set(placements.map(spawn => spawn.id)).size).toBe(placements.length);

      for (const spawn of placements) {
        const cell = grid.cellAt(spawn.position);
        const room = dungeon.rooms.find(item => item.id === spawn.roomId)!;
        expect(grid.isWalkable(cell)).toBe(true);
        expect(cell.x).toBeGreaterThan(room.x);
        expect(cell.x).toBeLessThan(room.x + room.width - 1);
        expect(cell.y).toBeGreaterThan(room.y);
        expect(cell.y).toBeLessThan(room.y + room.height - 1);
        expect(findPath(grid, dungeon.entrance, spawn.position)).not.toBeNull();
      }
      for (const room of dungeon.rooms.filter(item => item.role !== 'entrance')) {
        const occupants = placements.filter(spawn => spawn.roomId === room.id);
        expect(occupants.length).toBeGreaterThanOrEqual(2);
        for (let i = 0; i < occupants.length; i++) for (let j = i + 1; j < occupants.length; j++) {
          expect(Math.hypot(
            occupants[i].position.x - occupants[j].position.x,
            occupants[i].position.y - occupants[j].position.y,
          )).toBeGreaterThanOrEqual(64);
        }
      }
    }
  });

  it('provides exactly one stronger guardian inside the deepest chamber', () => {
    const dungeon = generateDungeon(42);
    const grid = createDungeonNavigationGrid(dungeon);
    const plan = planRoomEncounters(dungeon, grid);
    const guardians = plan.filter(spawn => spawn.guardian);
    const depth = dungeon.rooms.find(room => room.role === 'depth')!;
    expect(guardians).toHaveLength(1);
    expect(guardians[0].roomId).toBe(depth.id);
    expect(guardians[0].kind).toBe('brute');
    expect(guardians[0].maxHp).toBe(300);
    expect(plan.filter(spawn => spawn.roomId === depth.id)).toHaveLength(4);
  });
});

describe('deep chamber completion', () => {
  const setup = () => {
    const dungeon = generateDungeon(42);
    const grid = createDungeonNavigationGrid(dungeon);
    const director = new RoomEncounterDirector(dungeon, grid);
    const enemies = director.placements.map(spawn => ({ id: spawn.id, hp: spawn.maxHp }));
    return { dungeon, grid, director, enemies };
  };

  it('requires entering depth and defeating guardian, but no optional clears', () => {
    const { dungeon, director, enemies } = setup();
    const guardian = enemies.find(enemy => enemy.id === director.guardianId)!;
    guardian.hp = 0;
    expect(director.update(dungeon.entrance, enemies)).toBe(false);
    expect(director.completed).toBe(false);
    expect(director.hasEnteredDepth).toBe(false);
    expect(director.update(dungeon.depth, enemies)).toBe(true);
    expect(director.completed).toBe(true);
    expect(enemies.filter(enemy => enemy.hp > 0).length).toBeGreaterThan(0);
    expect(director.update(dungeon.depth, enemies)).toBe(false);
  });

  it('can visit depth before killing the guardian', () => {
    const { dungeon, director, enemies } = setup();
    expect(director.update(dungeon.depth, enemies)).toBe(false);
    expect(director.hasEnteredDepth).toBe(true);
    expect(director.guardianAlive(enemies)).toBe(true);
    enemies.find(enemy => enemy.id === director.guardianId)!.hp = 0;
    expect(director.update(dungeon.entrance, enemies)).toBe(true);
    expect(director.guardianAlive(enemies)).toBe(false);
  });

  it('tracks living enemies per original room, even when they leave it', () => {
    const { dungeon, director, enemies } = setup();
    const cache = dungeon.rooms.find(room => room.role === 'cache')!;
    const initial = director.roomHostiles(cache, enemies);
    expect(initial).toBeGreaterThanOrEqual(3);
    const id = director.placements.find(spawn => spawn.roomId === cache.id)!.id;
    enemies.find(enemy => enemy.id === id)!.hp = 0;
    expect(director.roomHostiles(cache, enemies)).toBe(initial - 1);
    expect(director.roomHostiles(null, enemies)).toBe(0);
  });

  it('starts fresh after restarting a dungeon with the same seed', () => {
    const { dungeon, grid, director, enemies } = setup();
    enemies.find(enemy => enemy.id === director.guardianId)!.hp = 0;
    director.update(dungeon.depth, enemies);
    const fresh = new RoomEncounterDirector(dungeon, grid);
    expect(fresh.completed).toBe(false);
    expect(fresh.hasEnteredDepth).toBe(false);
    expect(fresh.placements).toEqual(director.placements);
    expect(fresh.guardianAlive(fresh.placements.map(item => ({ id:item.id, hp:item.maxHp })))).toBe(true);
  });
});
