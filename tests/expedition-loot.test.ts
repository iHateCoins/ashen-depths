import { describe, expect, it } from 'vitest';
import {
  EXPEDITION_BAG_CAPACITY,
  ExpeditionLoot,
  PICKUP_RADIUS,
  lootHash,
  rollEnemyLoot,
} from '../src/game/loot/ExpeditionLoot';

describe('deterministic equipment drops', () => {
  it('generates identical items for the same seed/enemy and different items across seeds', () => {
    const first = rollEnemyLoot(42, 9, 'brute', false);
    expect(first).not.toBeNull();
    expect(rollEnemyLoot(42, 9, 'brute', false)).toEqual(first);
    expect(rollEnemyLoot(43, 9, 'brute', false)).not.toEqual(first);
    expect(lootHash(42, 9)).toBe(lootHash(42, 9));
  });

  it('Warden always gives rare equipment with two distinct affixes', () => {
    for (const seed of [0, 1, 42, 2026, 0xFFFFFFFF]) {
      const item = rollEnemyLoot(seed, 99, 'brute', true)!;
      expect(item.rarity).toBe('rare');
      expect(item.itemLevel).toBe(8);
      expect(item.affixes).toHaveLength(2);
      expect(new Set(item.affixes.map(affix => affix.id)).size).toBe(2);
      expect(item.affixes.every(affix => affix.value > 0)).toBe(true);
      expect(['weapon', 'armor', 'charm']).toContain(item.slot);
    }
  });

  it('normal enemies do not all drop, while brutes always produce an item', () => {
    const wretchDrops = Array.from({ length: 100 }, (_, id) =>
      rollEnemyLoot(42, id + 1, 'wretch', false)).filter(Boolean);
    expect(wretchDrops.length).toBeGreaterThan(30);
    expect(wretchDrops.length).toBeLessThan(80);
    for (let id = 1; id <= 100; id++) {
      expect(rollEnemyLoot(42, id, 'brute', false)).not.toBeNull();
    }
  });

  it('uses names, slots, rarity and numeric future-compatible modifiers', () => {
    for (let id = 1; id <= 60; id++) {
      const item = rollEnemyLoot(211, id, 'brute', false)!;
      expect(item.name.length).toBeGreaterThan(3);
      expect(item.baseName.length).toBeGreaterThan(3);
      expect(['common','magic','rare']).toContain(item.rarity);
      expect(item.affixes.length).toBe(item.rarity === 'rare' ? 2 : item.rarity === 'magic' ? 1 : 0);
      for (const affix of item.affixes) {
        expect(affix.label.length).toBeGreaterThan(3);
        expect(Number.isFinite(affix.value)).toBe(true);
      }
    }
  });
});

describe('unsecured expedition bag', () => {
  const player = { x: 120, y: 120 };
  it('never duplicates a kill drop or picked-up equipment', () => {
    const loot = new ExpeditionLoot(42);
    const first = loot.dropForEnemy(1, 'brute', false, { x: 130, y: 130 })!;
    expect(first.item).not.toBeNull();
    expect(loot.dropForEnemy(1, 'brute', false, { x: 130, y: 130 })).toBeNull();
    expect(loot.ground).toHaveLength(1);
    expect(loot.pickUp(first.id, player).status).toBe('picked-up');
    expect(loot.pickUp(first.id, player).status).toBe('not-found');
    expect(loot.bag).toHaveLength(1);
    expect(loot.ground).toHaveLength(0);
  });

  it('refuses remote pickup but allows deliberate pickup at the edge of range', () => {
    const loot = new ExpeditionLoot(5);
    const drop = loot.dropForEnemy(1, 'brute', false,
      { x: player.x + PICKUP_RADIUS, y: player.y })!;
    expect(loot.pickUp(drop.id, {x:0,y:0}).status).toBe('too-far');
    expect(loot.ground).toHaveLength(1);
    expect(loot.pickUp(drop.id, player).status).toBe('picked-up');
    expect(loot.bag).toHaveLength(1);
  });

  it('does not allow picking up loot through dungeon walls', () => {
    const loot = new ExpeditionLoot(5);
    const drop = loot.dropForEnemy(1, 'brute', false, { x: 140, y: 120 })!;
    const blocked = () => false;
    expect(loot.nearby(player, blocked)).toBeNull();
    expect(loot.pickUp(drop.id, player, blocked).status).toBe('too-far');
    expect(loot.ground).toHaveLength(1);
    expect(loot.pickUp(drop.id, player, () => true).status).toBe('picked-up');
  });

  it('allows only 24 items and never consumes ground loot on a full bag', () => {
    const loot = new ExpeditionLoot(12);
    expect(loot.capacity).toBe(EXPEDITION_BAG_CAPACITY);
    const items = Array.from({length:25}, (_,index) =>
      loot.dropForEnemy(index+1,'brute',false,player)!);
    for (const item of items.slice(0,24)) {
      expect(loot.pickUp(item.id, player).status).toBe('picked-up');
    }
    expect(loot.bag).toHaveLength(24);
    expect(loot.bagFull).toBe(true);
    expect(loot.pickUp(items[24].id,player).status).toBe('full');
    expect(loot.ground.map(drop=>drop.id)).toContain(items[24].id);
    expect(loot.discard(loot.bag[0].id,player)).not.toBeNull();
    expect(loot.bagFull).toBe(false);
    expect(loot.pickUp(items[24].id,player).status).toBe('picked-up');
  });

  it('discarding places the same item on the ground and does not create a duplicate', () => {
    const loot = new ExpeditionLoot(22);
    const drop = loot.dropForEnemy(1,'brute',false,player)!;
    loot.pickUp(drop.id,player);
    const item = loot.bag[0];
    const discarded = loot.discard(item.id, {x:150,y:150})!;
    expect(discarded.item).toEqual(item);
    expect(discarded.id).not.toBe(drop.id);
    expect(loot.bag).toHaveLength(0);
    expect(loot.ground).toHaveLength(1);
    expect(loot.discard(item.id,player)).toBeNull();
    expect(loot.pickUp(discarded.id,{x:150,y:150}).status).toBe('picked-up');
    expect(loot.bag[0]).toEqual(item);
  });

  it('restarting or ending an expedition does not preserve unsecured items', () => {
    const active = new ExpeditionLoot(42);
    const drop = active.dropForEnemy(1,'brute',false,player)!;
    active.pickUp(drop.id,player);
    expect(active.bag).toHaveLength(1);
    const replay = new ExpeditionLoot(42);
    expect(replay.bag).toHaveLength(0);
    expect(replay.ground).toHaveLength(0);
    expect(replay.dropForEnemy(1,'brute',false,player)?.item).toEqual(drop.item);
  });

  it('rejects invalid inventory sizes and out-of-range data requests', () => {
    expect(() => new ExpeditionLoot(1,0)).toThrow();
    expect(() => new ExpeditionLoot(1,1.5)).toThrow();
    const loot = new ExpeditionLoot(1);
    expect(loot.nearby(player)).toBeNull();
    expect(loot.pickUp('missing',player).status).toBe('not-found');
    expect(loot.discard('missing',player)).toBeNull();
  });
});
