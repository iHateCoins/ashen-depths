import { describe, expect, it } from 'vitest';
import { EncounterDirector, ENCOUNTER_WAVES } from '../src/game/combat/EncounterDirector';
import { planEncounterSpawns } from '../src/game/combat/SpawnPlanner';
import { NavigationGrid } from '../src/game/navigation/Grid';
import { findPath } from '../src/game/navigation/Pathfinder';

const tick = (encounter: EncounterDirector, seconds: number, alive: number) => {
  const events = [];
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++)
    events.push(...encounter.update(0.05, alive));
  return events;
};

describe('finite encounter progression', () => {
  it('starts the first wave after its countdown and stays in combat while enemies survive', () => {
    const director = new EncounterDirector();
    expect(tick(director, 1, 0)).toEqual([]);
    expect(tick(director, 0.6, 1)).toEqual([
      { type: 'wave-started', wave: 1, kinds: ENCOUNTER_WAVES[0] },
    ]);
    expect(tick(director, 20, 3)).toEqual([]);
    expect(director.phase).toBe('combat');
  });

  it('allows intermission, exactly three waves and one completion event', () => {
    const director = new EncounterDirector();
    expect(tick(director, 1.55, 1)).toHaveLength(1);
    expect(director.update(0.05, 0)).toEqual([
      { type: 'wave-cleared', wave: 1, final: false },
    ]);
    expect(tick(director, 2.95, 0)).toEqual([]);
    expect(tick(director, 0.1, 1)).toEqual([
      { type: 'wave-started', wave: 2, kinds: ENCOUNTER_WAVES[1] },
    ]);
    expect(director.update(0.05, 0)).toEqual([
      { type: 'wave-cleared', wave: 2, final: false },
    ]);
    expect(tick(director, 3.1, 1)).toEqual([
      { type: 'wave-started', wave: 3, kinds: ENCOUNTER_WAVES[2] },
    ]);
    expect(director.update(0.05, 0)).toEqual([
      { type: 'wave-cleared', wave: 3, final: true },
    ]);
    expect(director.completed).toBe(true);
    expect(tick(director, 60, 0)).toEqual([]);
    expect(director.wave).toBe(3);
  });

  it('ignores invalid time deltas and never advances multiple waves in one paused frame', () => {
    const director = new EncounterDirector();
    expect(director.update(Number.NaN, 0)).toEqual([]);
    expect(director.update(-1, 0)).toEqual([]);
    expect(director.update(1000, 0)).toEqual([]);
    expect(director.timeRemaining).toBeCloseTo(1.4);
  });
});

describe('reachable encounter spawning', () => {
  it('places all requested enemies in clear reachable cells without overlaps', () => {
    const grid = new NavigationGrid(1408, 1152, 32);
    const origin = { x: 704, y: 576 };
    const requested = ENCOUNTER_WAVES[2];
    const spawns = planEncounterSpawns(grid, origin, requested, 3);
    expect(spawns.map(s => s.kind)).toEqual(requested);
    expect(planEncounterSpawns(grid, origin, requested, 3)).toEqual(spawns);
    for (const spawn of spawns) {
      expect(grid.isWalkable(grid.cellAt(spawn.position))).toBe(true);
      expect(findPath(grid, origin, spawn.position)).not.toBeNull();
      expect(Math.hypot(spawn.position.x - origin.x, spawn.position.y - origin.y))
        .toBeGreaterThanOrEqual(100);
    }
    for (let a = 0; a < spawns.length; a++) {
      for (let b = a + 1; b < spawns.length; b++) {
        expect(Math.hypot(
          spawns[a].position.x - spawns[b].position.x,
          spawns[a].position.y - spawns[b].position.y,
        )).toBeGreaterThanOrEqual(64);
      }
    }
  });

  it('never spawns enemies inside blocked tiles or unreachable sealed rooms', () => {
    const grid = new NavigationGrid(640, 640, 32);
    for (let y = 0; y < grid.rows; y++) grid.setBlocked({ x: 10, y });
    const origin = { x: 160, y: 320 };
    const spawns = planEncounterSpawns(grid, origin, ENCOUNTER_WAVES[2], 3);
    for (const spawn of spawns) {
      expect(spawn.position.x).toBeLessThan(320);
      expect(grid.isWalkable(grid.cellAt(spawn.position))).toBe(true);
    }
  });

  it('does not spawn anything when the player is standing in blocked space', () => {
    const grid = new NavigationGrid(320, 320, 32);
    grid.setBlocked({ x: 2, y: 2 });
    expect(planEncounterSpawns(grid, { x: 80, y: 80 }, ['wretch'], 1)).toEqual([]);
  });
});

describe('between-wave recovery', () => {
  it('restores health only up to the maximum', async () => {
    const { PlayerHealth } = await import('../src/game/combat/PlayerHealth');
    const health = new PlayerHealth(100);
    health.damage(30);
    expect(health.heal(20)).toBe(20);
    expect(health.hp).toBe(90);
    expect(health.heal(20)).toBe(10);
    expect(health.hp).toBe(100);
    expect(health.heal(-1)).toBe(0);
    expect(health.heal(Number.POSITIVE_INFINITY)).toBe(0);
    health.damage(100);
    expect(health.heal(20)).toBe(0);
    expect(health.hp).toBe(0);
  });
});
