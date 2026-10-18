import type { Point } from '../movement/MovementController';
import type { EnemyKind } from '../combat/EnemyAI';

export type ItemRarity = 'common' | 'magic' | 'rare';
export type EquipmentSlot = 'weapon' | 'armor' | 'charm';

export interface ItemAffix {
  id: 'sharp' | 'sturdy' | 'ember' | 'vital';
  label: string;
  value: number;
}
export interface LootItem {
  id: string;
  name: string;
  baseName: string;
  rarity: ItemRarity;
  slot: EquipmentSlot;
  itemLevel: number;
  affixes: ItemAffix[];
}
export interface GroundLoot {
  id: string;
  item: LootItem;
  position: Point;
}
export interface PickupResult {
  status: 'picked-up' | 'too-far' | 'full' | 'not-found';
  item?: LootItem;
}
export const EXPEDITION_BAG_CAPACITY = 24;
export const PICKUP_RADIUS = 84;

const BASES: Readonly<Record<EquipmentSlot, readonly string[]>> = {
  weapon: ['Rustbound Sword', 'Iron Cleaver', 'Ashwood Staff', 'Spiked Mace'],
  armor: ['Traveler Coat', 'Ironmail Vest', 'Tattered Mantle', 'Scavenger Armor'],
  charm: ['Ember Idol', 'Bone Pendant', 'Moonstone Sigil', 'Onyx Talisman'],
};
const PREFIXES: Readonly<Record<ItemRarity, string>> = {
  common: '', magic: 'Enchanted', rare: 'Forgotten',
};

/** Stable unsigned hash: does not depend on frame timing or Math.random. */
export function lootHash(...values: number[]): number {
  let state = 0x811c9dc5;
  for (const value of values) {
    state ^= value >>> 0;
    state = Math.imul(state, 0x01000193);
    state ^= state >>> 16;
  }
  return state >>> 0;
}

/**
 * Stable item generation for enemy ID + dungeon seed. Brutes always drop,
 * ordinary Wretches have a 60% chance, and the Warden always drops rare gear.
 * All affixes are rolled in model data for future equipping/loot economy.
 */
export function rollEnemyLoot(
  dungeonSeed: number,
  enemyId: number,
  kind: EnemyKind,
  guardian: boolean,
): LootItem | null {
  const roll = lootHash(dungeonSeed, enemyId, 0xCAFE);
  if (!guardian && kind === 'wretch' && roll % 10 >= 6) return null;
  const rarity: ItemRarity = guardian ? 'rare' :
    (lootHash(dungeonSeed, enemyId, 11) % 100 < 13 ? 'rare' :
      lootHash(dungeonSeed, enemyId, 23) % 100 < 52 ? 'magic' : 'common');
  const slots: readonly EquipmentSlot[] = ['weapon', 'armor', 'charm'];
  const slot = slots[lootHash(dungeonSeed, enemyId, 2) % slots.length];
  const baseNames = BASES[slot];
  const baseName = baseNames[lootHash(dungeonSeed, enemyId, 3) % baseNames.length];
  const affixCount = rarity === 'rare' ? 2 : rarity === 'magic' ? 1 : 0;
  const available: ItemAffix['id'][] = slot === 'weapon'
    ? ['sharp', 'ember', 'vital']
    : slot === 'armor' ? ['sturdy', 'vital', 'ember'] : ['vital', 'ember', 'sharp'];
  const affixes: ItemAffix[] = [];
  for (let index = 0; index < affixCount; index++) {
    const selection = lootHash(dungeonSeed, enemyId, 50 + index) % available.length;
    const id = available.splice(selection, 1)[0];
    const value = 2 + (lootHash(dungeonSeed, enemyId, 80 + index) % (guardian ? 10 : 7));
    const label = id === 'sharp' ? 'Attack Power' : id === 'sturdy' ? 'Armor' :
      id === 'vital' ? 'Maximum Health' : 'Ember Potency';
    affixes.push({ id, label, value });
  }
  const itemLevel = guardian ? 8 : kind === 'brute' ? 5 : 2 + (lootHash(dungeonSeed, enemyId, 71) % 3);
  return {
    id: `item-${dungeonSeed >>> 0}-${enemyId}`,
    baseName,
    name: PREFIXES[rarity] ? `${PREFIXES[rarity]} ${baseName}` : baseName,
    rarity,
    slot,
    itemLevel,
    affixes,
  };
}

export class ExpeditionLoot {
  readonly bag: LootItem[] = [];
  readonly ground: GroundLoot[] = [];
  private defeated = new Set<number>();
  private serial = 0;

  constructor(
    readonly dungeonSeed: number,
    readonly capacity = EXPEDITION_BAG_CAPACITY,
  ) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('Expedition bag capacity must be a positive integer');
    }
  }

  get bagFull(): boolean { return this.bag.length >= this.capacity; }

  /** Returns at most one new ground drop per enemy, including after replayed frames. */
  dropForEnemy(
    enemyId: number,
    kind: EnemyKind,
    guardian: boolean,
    position: Point,
  ): GroundLoot | null {
    if (this.defeated.has(enemyId)) return null;
    this.defeated.add(enemyId);
    const item = rollEnemyLoot(this.dungeonSeed, enemyId, kind, guardian);
    if (!item) return null;
    const dropped = {
      id: `ground-${++this.serial}`,
      item,
      position: { ...position },
    };
    this.ground.push(dropped);
    return dropped;
  }

  nearby(player: Point): GroundLoot | null {
    let closest: GroundLoot | null = null;
    let bestDistance = PICKUP_RADIUS;
    for (const drop of this.ground) {
      const distance = Math.hypot(player.x - drop.position.x, player.y - drop.position.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        closest = drop;
      }
    }
    return closest;
  }

  pickUp(id: string, player: Point): PickupResult {
    const index = this.ground.findIndex(drop => drop.id === id);
    if (index < 0) return { status: 'not-found' };
    const drop = this.ground[index];
    if (Math.hypot(drop.position.x - player.x, drop.position.y - player.y) > PICKUP_RADIUS) {
      return { status: 'too-far' };
    }
    if (this.bagFull) return { status: 'full' };
    this.ground.splice(index, 1);
    this.bag.push(drop.item);
    return { status: 'picked-up', item: drop.item };
  }

  /** Discarding is intentional; dropped items reappear beside the character. */
  discard(itemId: string, player: Point): GroundLoot | null {
    const index = this.bag.findIndex(item => item.id === itemId);
    if (index < 0) return null;
    const item = this.bag.splice(index, 1)[0];
    const dropped: GroundLoot = {
      id: `ground-${++this.serial}`,
      item,
      position: { ...player },
    };
    this.ground.push(dropped);
    return dropped;
  }
}
