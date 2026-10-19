import type { Point } from '../movement/MovementController';
import type { GroundLoot, ItemRarity } from './ExpeditionLoot';

/** Loot grouping only affects rendering: each actual drop retains its ID and position. */
export const LOOT_CLUSTER_DISTANCE = 66;

export interface LootCluster {
  readonly id: string;
  readonly members: readonly GroundLoot[];
  readonly position: Point;
  readonly topRarity: ItemRarity;
}

const RARITY_ORDER: Readonly<Record<ItemRarity, number>> = {
  common: 0,
  magic: 1,
  rare: 2,
};

/**
 * Deterministic single-link groups keep tightly packed drops from plastering
 * several overlapping item names across the dungeon. Group IDs are stable
 * for a given set of drops, independent of input order.
 *
 * This never changes the source items, loot probabilities, pickup distances,
 * fog logic, line of sight or inventory ownership.
 */
export function groupGroundLoot(
  drops: readonly GroundLoot[],
  threshold = LOOT_CLUSTER_DISTANCE,
): LootCluster[] {
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('Invalid grouping radius');
  const sorted = [...drops].sort((a, b) => a.id.localeCompare(b.id));
  const parent = sorted.map((_, i) => i);
  function root(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (Math.hypot(
        sorted[i].position.x - sorted[j].position.x,
        sorted[i].position.y - sorted[j].position.y,
      ) > threshold) continue;
      const first = root(i), second = root(j);
      if (first !== second) parent[second] = first;
    }
  }

  const grouped = new Map<number, GroundLoot[]>();
  sorted.forEach((drop, index) => {
    const key = root(index);
    const members = grouped.get(key) ?? [];
    members.push(drop);
    grouped.set(key, members);
  });
  return [...grouped.values()].map(members => ({
    id: members.map(member => member.id).join('|'),
    members,
    // Anchor to a real dropped item rather than the arithmetic center;
    // that center could be inside a solid wall or outside the floor.
    position: (() => {
      const center = {
        x: members.reduce((sum, member) => sum + member.position.x, 0) / members.length,
        y: members.reduce((sum, member) => sum + member.position.y, 0) / members.length,
      };
      const closest = [...members].sort((a, b) =>
        Math.hypot(a.position.x - center.x, a.position.y - center.y) -
        Math.hypot(b.position.x - center.x, b.position.y - center.y) ||
        a.id.localeCompare(b.id)
      )[0];
      return { ...closest.position };
    })(),
    topRarity: members.reduce<ItemRarity>((best, member) =>
      RARITY_ORDER[member.item.rarity] > RARITY_ORDER[best] ? member.item.rarity : best,
    members[0].item.rarity),
  })).sort((a, b) => a.id.localeCompare(b.id));
}
