import { describe, expect, it } from 'vitest';
import { groupGroundLoot, LOOT_CLUSTER_DISTANCE } from '../src/game/loot/LootPresentation';
import { ExpeditionLoot, type GroundLoot, type LootItem } from '../src/game/loot/ExpeditionLoot';

function item(id: string, rarity: LootItem['rarity'] = 'common'): LootItem {
  return {
    id, name: `Test Item ${id}`, baseName: 'Test Item', rarity,
    slot: 'weapon', itemLevel: 3, affixes: [],
  };
}
function drop(id: string, x: number, y: number, rarity: LootItem['rarity'] = 'common'): GroundLoot {
  return { id, position: { x, y }, item: item(id, rarity) };
}

describe('clutter-free ground loot rendering', () => {
  it('keeps separated loot as independent visible piles', () => {
    const input = [drop('a', 80, 120), drop('b', 360, 120), drop('c', 620, 120)];
    const groups = groupGroundLoot(input);
    expect(groups).toHaveLength(3);
    expect(groups.every(g => g.members.length === 1)).toBe(true);
    expect(groups.map(g => g.id)).toEqual(['a','b','c']);
  });

  it('groups overlapping drops under the highest rarity without merging loot', () => {
    const input = [
      drop('a', 200, 200, 'common'),
      drop('b', 232, 200, 'rare'),
      drop('c', 256, 222, 'magic'),
    ];
    const groups = groupGroundLoot(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map(m => m.id)).toEqual(['a','b','c']);
    expect(groups[0].topRarity).toBe('rare');
    expect(groups[0].members).toHaveLength(3);
    expect(groups[0].position).toEqual(input[1].position);
    expect(input[0].item.rarity).toBe('common');
    expect(input[1].item.rarity).toBe('rare');
  });

  it('produces the same grouped markers regardless of kill ordering', () => {
    const input = [
      drop('ground-1', 0, 0),
      drop('ground-2', 40, 30, 'rare'),
      drop('ground-3', 350, 200),
      drop('ground-4', 385, 190, 'magic'),
    ];
    const reversed = groupGroundLoot([...input].reverse());
    expect(reversed).toEqual(groupGroundLoot(input));
    expect(reversed).toHaveLength(2);
  });

  it('handles chained adjacent drops deterministically using real anchor positions', () => {
    const input = [
      drop('a', 10, 10),
      drop('b', 10 + LOOT_CLUSTER_DISTANCE - 1, 10),
      drop('c', 10 + 2 * (LOOT_CLUSTER_DISTANCE - 1), 10),
    ];
    const groups = groupGroundLoot(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
    expect(input.some(m => m.position.x === groups[0].position.x)).toBe(true);
    expect(input.some(m => m.position.y === groups[0].position.y)).toBe(true);
  });

  it('updates a group's item count when each specific item is collected', () => {
    const loot = new ExpeditionLoot(42);
    const near = { x: 120, y: 120 };
    const first = loot.dropForEnemy(1, 'brute', false, { x: 130, y: 120 })!;
    const second = loot.dropForEnemy(2, 'brute', false, { x: 160, y: 120 })!;
    expect(groupGroundLoot(loot.ground)).toHaveLength(1);
    expect(groupGroundLoot(loot.ground)[0].members).toHaveLength(2);
    expect(loot.nearbyItems(near).map(x => x.id)).toEqual([first.id, second.id]);
    expect(loot.pickUp(second.id, near).status).toBe('picked-up');
    expect(groupGroundLoot(loot.ground)[0].members.map(x => x.id)).toEqual([first.id]);
    expect(loot.ground).toHaveLength(1);
    expect(loot.bag.map(x => x.id)).toEqual([second.item.id]);
    expect(loot.pickUp(first.id, near).status).toBe('picked-up');
    expect(groupGroundLoot(loot.ground)).toEqual([]);
  });

  it('maintains individual distance and wall checks even for the same rendered pile', () => {
    const loot = new ExpeditionLoot(50);
    const first = loot.dropForEnemy(1, 'brute', false, { x: 50, y: 50 })!;
    const second = loot.dropForEnemy(2, 'brute', false, { x: 100, y: 50 })!;
    const player = { x: 25, y: 50 };
    expect(groupGroundLoot(loot.ground)).toHaveLength(1);
    expect(loot.nearbyItems(player).map(x => x.id)).toEqual([first.id, second.id]);
    const visible = loot.nearbyItems(player, (_, position) => position.x < 90);
    expect(visible.map(x => x.id)).toEqual([first.id]);
    expect(loot.pickUp(second.id, player, (_, position) => position.x < 90).status).toBe('too-far');
    expect(loot.ground).toHaveLength(2);
    expect(loot.bag).toHaveLength(0);
  });

  it('refuses invalid cluster radii', () => {
    expect(() => groupGroundLoot([], 0)).toThrow();
    expect(() => groupGroundLoot([], Number.NaN)).toThrow();
  });
});
