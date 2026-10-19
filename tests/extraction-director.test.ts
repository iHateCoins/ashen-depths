import { describe, expect, it } from 'vitest';
import { generateDungeon, createDungeonNavigationGrid } from '../src/game/dungeon/DungeonGenerator';
import {
  ExtractionDirector, EXTRACTION_SECONDS, EXTRACTION_RADIUS, planExtractionSites,
} from '../src/game/dungeon/ExtractionDirector';
import { OptionalObjectiveDirector } from '../src/game/dungeon/OptionalObjectiveDirector';
import { RoomEncounterDirector } from '../src/game/combat/RoomEncounterDirector';

describe('seeded optional extraction sites', () => {
  it('places two accessible separate waystones, never in entrance/cache/depth/shrine', () => {
    for (const seed of [0, 1, 7, 42, 2026, 0xFFFFFFFF]) {
      const dungeon = generateDungeon(seed);
      const grid = createDungeonNavigationGrid(dungeon);
      const extraction = new ExtractionDirector(dungeon);
      const optional = new OptionalObjectiveDirector(
        dungeon, new RoomEncounterDirector(dungeon, grid),
      );
      expect(extraction.sites).toHaveLength(2);
      expect(new Set(extraction.sites.map(site => site.roomId)).size).toBe(2);
      const shrine = optional.objectives.find(item => item.id === 'shrine')!;
      const cache = optional.objectives.find(item => item.id === 'cache')!;
      for (const site of extraction.sites) {
        const room = dungeon.rooms.find(room => room.id === site.roomId)!;
        expect(room.role).toBe('chamber');
        expect(site.roomId).not.toBe(shrine.roomId);
        expect(site.roomId).not.toBe(cache.roomId);
        expect(grid.isWalkable(grid.cellAt(site.position))).toBe(true);
        expect(extraction.nearby(site.position)?.id).toBe(site.id);
        expect(site.id).toMatch(/waystone/);
      }
      expect(planExtractionSites(dungeon)).toEqual(extraction.sites);
    }
  });

  it('cannot start remotely, inside walls or at the wrong exit', () => {
    const dungeon = generateDungeon(42);
    const extraction = new ExtractionDirector(dungeon);
    const first = extraction.sites[0];
    expect(extraction.nearby(dungeon.entrance)).toBeNull();
    expect(extraction.start(first.id, dungeon.entrance)).toBe(false);
    expect(extraction.start('nonexistent', first.position)).toBe(false);
    expect(extraction.nearby({ x: NaN, y: 0 })).toBeNull();
    expect(extraction.nearby({ x: first.position.x + EXTRACTION_RADIUS + 15, y: first.position.y })).toBeNull();
    expect(extraction.phase).toBe('idle');
  });

  it('never automatically extracts by walking onto a waystone', () => {
    const d = new ExtractionDirector(generateDungeon(42));
    expect(d.nearby(d.sites[0].position)).not.toBeNull();
    expect(d.update(1000, d.sites[0].position, false, false)).toBe('idle');
    expect(d.phase).toBe('idle');
    expect(d.elapsed).toBe(0);
  });

  it('completes only after explicit uninterrupted 2.5 seconds and cannot repeat', () => {
    const d = new ExtractionDirector(generateDungeon(42));
    const site = d.sites[0];
    expect(d.start(site.id, site.position)).toBe(true);
    expect(d.start(site.id, site.position)).toBe(false);
    expect(d.update(EXTRACTION_SECONDS - 0.01, site.position, false, false)).toBe('channeling');
    expect(d.remaining).toBeCloseTo(0.01);
    expect(d.update(0.01, site.position, false, false)).toBe('completed');
    expect(d.phase).toBe('completed');
    expect(d.start(site.id, site.position)).toBe(false);
    expect(d.update(0.1, site.position, false, false)).toBe('completed');
  });

  it('taking any damage, leaving radius or dying interrupts and resets elapsed time', () => {
    const d = new ExtractionDirector(generateDungeon(42));
    const point = d.sites[0].position;
    d.start(d.sites[0].id, point);
    expect(d.update(1.2, point, false, false)).toBe('channeling');
    expect(d.update(0.01, point, true, false)).toBe('interrupted');
    expect(d.phase).toBe('idle');
    expect(d.elapsed).toBe(0);
    d.start(d.sites[0].id, point);
    expect(d.update(0.8, point, false, false)).toBe('channeling');
    expect(d.update(0.01, { x: point.x + 200, y: point.y }, false, false))
      .toBe('interrupted');
    d.start(d.sites[0].id, point);
    expect(d.update(0.01, point, false, true)).toBe('interrupted');
    expect(d.phase).toBe('idle');
  });

  it('manual cancel and failed save allow fresh attempts without phantom completion', () => {
    const d = new ExtractionDirector(generateDungeon(2026));
    const site = d.sites[1];
    d.start(site.id, site.position);
    d.update(1.0, site.position, false, false);
    d.cancel();
    expect(d.phase).toBe('idle');
    d.start(site.id, site.position);
    expect(d.update(EXTRACTION_SECONDS, site.position, false, false)).toBe('completed');
    d.resetAfterSaveFailure();
    expect(d.phase).toBe('idle');
    expect(d.start(site.id, site.position)).toBe(true);
    expect(d.update(EXTRACTION_SECONDS, site.position, false, false)).toBe('completed');
  });

  it('rejects invalid elapsed time while channeling', () => {
    const d = new ExtractionDirector(generateDungeon(42));
    const site = d.sites[0];
    d.start(site.id, site.position);
    expect(() => d.update(-1, site.position, false, false)).toThrow('delta');
    expect(() => d.update(Infinity, site.position, false, false)).toThrow('delta');
  });
});
