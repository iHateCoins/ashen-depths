import { describe, expect, it } from 'vitest';
import { enemyHealthMultiplier, enemyStrikeDepthBonus, MAX_EXPEDITION_DEPTH, threatAtDepth } from '../src/game/dungeon/DepthBalance';
import { mitigatedHitDamage } from '../src/game/loot/EquipmentLoadout';
import { rollEnemyLoot } from '../src/game/loot/ExpeditionLoot';
import { seedForDepth } from '../src/game/dungeon/DepthProgression';
import { createDungeonNavigationGrid, generateDungeon } from '../src/game/dungeon/DungeonGenerator';
import { planRoomEncounters } from '../src/game/combat/RoomEncounterDirector';
import { WARDEN_VARIANTS, wardenForDepth } from '../src/game/combat/DepthEncounters';

describe('M07 integrated dungeon scaling and reproducibility', () => {
  it('preserves all pre-PR06 HP and strike numbers on Depths 1 through 16', () => {
    for (let depth = 1; depth <= 16; depth++) {
      expect(enemyHealthMultiplier(depth)).toBeCloseTo(1 + (depth - 1) * 0.18, 12);
      expect(enemyStrikeDepthBonus(depth)).toBe(Math.min(30, (depth - 1) * 2));
    }
    expect(enemyHealthMultiplier(1)).toBe(1);
    expect(enemyStrikeDepthBonus(1)).toBe(0);
    expect(enemyHealthMultiplier(16)).toBeCloseTo(3.7);
    expect(enemyStrikeDepthBonus(16)).toBe(30);
  });

  it('avoids the old floor-16 threat plateau while loot power keeps increasing', () => {
    const depths = [16, 17, 24, 48, 96, 192, 384, MAX_EXPEDITION_DEPTH];
    for (let i = 1; i < depths.length; i++) {
      expect(enemyHealthMultiplier(depths[i])).toBeGreaterThan(enemyHealthMultiplier(depths[i-1]));
      expect(enemyStrikeDepthBonus(depths[i])).toBeGreaterThan(enemyStrikeDepthBonus(depths[i-1]));
    }
    for (const depth of [1, 2, 8, 16, 32, 64, 128, 256, 497]) {
      const dungeonSeed = seedForDepth(42, depth);
      const guardian = rollEnemyLoot(dungeonSeed, 999, 'brute', true, depth)!;
      expect(guardian.itemLevel).toBe(8 + (depth - 1) * 2);
      expect(guardian.itemLevel).toBeLessThanOrEqual(1000);
      const baseWardenHp = 300 * enemyHealthMultiplier(depth);
      expect(baseWardenHp).toBeGreaterThanOrEqual(300);
      // An on-tier armor piece should remain meaningful but not make attacks
      // completely irrelevant at very deep floors.
      if (depth >= 32) {
        const approximateArmor = 1 + Math.floor((5 + 2 * (depth - 1)) / 2);
        const damage = mitigatedHitDamage(22 + enemyStrikeDepthBonus(depth), approximateArmor);
        expect(damage).toBeGreaterThan(1);
        expect(damage).toBeLessThan(70);
      }
    }
  });

  it('rejects malformed/unreachable floors and assigns meaningful threat groups', () => {
    for (const depth of [-1, 0, 0.5, 498, Infinity, NaN]) {
      expect(() => enemyHealthMultiplier(depth)).toThrow();
      expect(() => enemyStrikeDepthBonus(depth)).toThrow();
      expect(() => threatAtDepth(depth)).toThrow();
    }
    expect(threatAtDepth(1)).toBe("Warden's Reach");
    expect(threatAtDepth(3)).toBe('Deep Peril');
    expect(threatAtDepth(9)).toBe('Abyssal');
  });

  it('seeded multi-depth floors keep precisely one valid boss and deterministic variant', () => {
    for (const expeditionSeed of [0, 1, 7, 42, 2026, 0xffffffff]) {
      const encountered = new Set<number>();
      for (const depth of [1, 2, 3, 4, 6, 8, 12, 24]) {
        const seed = seedForDepth(expeditionSeed, depth);
        expect(encountered.has(seed)).toBe(false);
        encountered.add(seed);
        const layout = generateDungeon(seed);
        const grid = createDungeonNavigationGrid(layout);
        const encounters = planRoomEncounters(layout, grid, depth);
        expect(encounters).toEqual(planRoomEncounters(layout, grid, depth));
        expect(encounters.filter(item => item.guardian)).toHaveLength(1);
        expect(encounters.filter(item => item.elite && item.guardian)).toHaveLength(0);
        expect(encounters.find(item => item.guardian)?.wardenVariant ?? 'warden')
          .toBe(wardenForDepth(depth));
        for (const placement of encounters) {
          expect(grid.isWalkable(grid.cellAt(placement.position))).toBe(true);
          if (placement.elite) {
            expect(depth).toBeGreaterThanOrEqual(3);
            expect(placement.maxHp).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(WARDEN_VARIANTS['ash-reaver'].profile.attackRadius).toBeLessThan(
      WARDEN_VARIANTS['stone-sentinel'].profile.attackRadius);
  });
});
