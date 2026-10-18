import { describe, expect, it } from 'vitest';
import { AutoCombat } from '../src/game/combat/AutoCombat';
import { RoomEncounterDirector } from '../src/game/combat/RoomEncounterDirector';
import { createDungeonNavigationGrid, generateDungeon } from '../src/game/dungeon/DungeonGenerator';
import { OptionalObjectiveDirector } from '../src/game/dungeon/OptionalObjectiveDirector';

const setup = (seed = 42) => {
  const dungeon = generateDungeon(seed);
  const grid = createDungeonNavigationGrid(dungeon);
  const encounters = new RoomEncounterDirector(dungeon, grid);
  const objectives = new OptionalObjectiveDirector(dungeon, encounters);
  const enemies = encounters.placements.map(spawn => ({ id: spawn.id, hp: spawn.maxHp }));
  const cache = objectives.objectives.find(objective => objective.id === 'cache')!;
  const shrine = objectives.objectives.find(objective => objective.id === 'shrine')!;
  return { dungeon, grid, encounters, objectives, enemies, cache, shrine };
};

describe('seeded, optional dungeon objectives', () => {
  it('places a guarded cache and a sanctuary in a separate ordinary chamber', () => {
    for (const seed of [0, 1, 7, 42, 2026, 0xFFFFFFFF]) {
      const { dungeon, grid, objectives, cache, shrine } = setup(seed);
      expect(objectives.totalCount).toBe(2);
      expect(objectives.claimedCount).toBe(0);
      expect(cache.roomId).toBe(dungeon.rooms.find(room => room.role === 'cache')!.id);
      expect(dungeon.rooms.find(room => room.id === shrine.roomId)!.role).toBe('chamber');
      expect(cache.roomId).not.toBe(shrine.roomId);
      expect(grid.isWalkable(grid.cellAt(cache.position))).toBe(true);
      expect(grid.isWalkable(grid.cellAt(shrine.position))).toBe(true);
      expect(setup(seed).objectives.objectives).toEqual(objectives.objectives);
    }
  });

  it('cannot activate from outside range, outside the room, or with guards still alive', () => {
    const { dungeon, objectives, enemies, cache, shrine } = setup();
    expect(objectives.nearby(dungeon.entrance, enemies, 50, 100)).toBeNull();
    expect(objectives.activate('cache', dungeon.entrance, enemies, 50, 100)).toBeNull();
    expect(objectives.activate('shrine', cache.position, enemies, 50, 100)).toBeNull();
    const nearby = objectives.nearby(cache.position, enemies, 50, 100)!;
    expect(nearby.objective.id).toBe('cache');
    expect(nearby.availability).toBe('guarded');
    expect(nearby.remainingGuards).toBeGreaterThan(0);
    expect(objectives.activate('cache', cache.position, enemies, 50, 100)).toBeNull();
    expect(objectives.hasClaimed('cache')).toBe(false);
    expect(objectives.nearby(shrine.position, enemies, 100, 100)!.availability).toBe('healthy');
  });

  it('opens a guarded cache once after its assigned enemies are defeated', () => {
    const { encounters, objectives, enemies, cache } = setup();
    // Other rooms (including the Warden) remain alive: no room-lock dependency.
    for (const spawn of encounters.placements.filter(spawn => spawn.roomId === cache.roomId)) {
      enemies.find(enemy => enemy.id === spawn.id)!.hp = 0;
    }
    expect(objectives.nearby(cache.position, enemies, 70, 100)!.availability).toBe('ready');
    expect(objectives.activate('cache', cache.position, enemies, 70, 100))
      .toEqual({ kind: 'ember-edge', damageBonus: 10 });
    expect(objectives.attackBonus).toBe(10);
    expect(objectives.claimedCount).toBe(1);
    expect(objectives.activate('cache', cache.position, enemies, 70, 100)).toBeNull();
    expect(encounters.guardianAlive(enemies)).toBe(true);
  });

  it('sanctuary cannot waste a charge at full health and can heal once when hurt', () => {
    const { objectives, enemies, shrine } = setup();
    expect(objectives.activate('shrine', shrine.position, enemies, 100, 100)).toBeNull();
    expect(objectives.claimedCount).toBe(0);
    expect(objectives.activate('shrine', shrine.position, enemies, 65, 100))
      .toEqual({ kind: 'sanctuary', healAmount: 35 });
    expect(objectives.hasClaimed('shrine')).toBe(true);
    expect(objectives.activate('shrine', shrine.position, enemies, 65, 100)).toBeNull();
    expect(objectives.attackBonus).toBe(0);
  });

  it('bonuses are applied to automatic basic attacks without resetting their cooldown', () => {
    const attack = new AutoCombat(250, 25, 0.7);
    const targets = [{ id: 1, position: { x: 40, y: 40 }, hp: 100, maxHp: 100 }];
    expect(attack.update({ x: 40, y: 40 }, targets, 0.016))
      .toEqual([{ targetId: 1, damage: 25 }]);
    const priorCooldown = attack.cooldown;
    attack.bonusDamage = 10;
    expect(attack.cooldown).toBe(priorCooldown);
    for (let i = 0; i < 7; i++) attack.update({ x: 40, y: 40 }, [], 0.1);
    expect(attack.update({ x: 40, y: 40 }, targets, 0.016))
      .toEqual([{ targetId: 1, damage: 35 }]);
    expect(targets[0].hp).toBe(40);
  });

  it('replaying resets both objectives and damage bonuses even with the same seed', () => {
    const { dungeon, grid, encounters, objectives, enemies, shrine } = setup();
    expect(objectives.activate('shrine', shrine.position, enemies, 50, 100))
      .toEqual({ kind: 'sanctuary', healAmount: 35 });
    expect(objectives.claimedCount).toBe(1);
    const fresh = new OptionalObjectiveDirector(dungeon, new RoomEncounterDirector(dungeon, grid));
    expect(fresh.claimedCount).toBe(0);
    expect(fresh.attackBonus).toBe(0);
    expect(fresh.objectives).toEqual(objectives.objectives);
    expect(encounters.completed).toBe(false);
  });
});
