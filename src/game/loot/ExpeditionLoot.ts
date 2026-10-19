import type { Point } from '../movement/MovementController';
import type { EnemyKind } from '../combat/EnemyAI';

export type ItemRarity = 'common' | 'magic' | 'rare';
export type EquipmentSlot = 'weapon' | 'armor' | 'charm';

export type ItemAffixId =
  | 'sharp' | 'sturdy' | 'ember' | 'vital'
  | 'battlemage' | 'raider' | 'bastion' | 'spellward';
export interface ItemAffix {
  id: ItemAffixId;
  label: string;
  value: number;
  /** Optional for pre-M06 saves; legacy affixes implicitly have tier 1. */
  tier?: 1 | 2 | 3;
}

/** Readable contribution per signed roll; dual-stat affixes can be cursed by the forge. */
export function affixBonuses(affix: ItemAffix): {
  attack: number; spell: number; armor: number; health: number;
} {
  const v = affix.value;
  const half = v < 0 ? -Math.max(1, Math.round(-v / 2)) : Math.max(1, Math.round(v / 2));
  switch (affix.id) {
    case 'sharp': return { attack:v, spell:0, armor:0, health:0 };
    case 'ember': return { attack:0, spell:v, armor:0, health:0 };
    case 'sturdy': return { attack:0, spell:0, armor:v, health:0 };
    case 'vital': return { attack:0, spell:0, armor:0, health:v };
    case 'battlemage': return { attack:v, spell:half, armor:0, health:0 };
    case 'raider': return { attack:v, spell:0, armor:0, health:half };
    case 'bastion': return { attack:0, spell:0, armor:half, health:v };
    case 'spellward': return { attack:0, spell:v, armor:half, health:0 };
  }
}
export const AFFIX_NAMES: Readonly<Record<ItemAffixId, string>> = {
  sharp:'Attack Power', sturdy:'Armor', ember:'Ember Potency', vital:'Maximum Health',
  battlemage:"Battlemage's Might", raider:"Raider's Vigor",
  bastion:"Bastion's Resolve", spellward:"Spellward's Focus",
};
export const AFFIX_POOLS: Readonly<Record<EquipmentSlot, readonly ItemAffixId[]>> = {
  weapon: ['sharp','ember','vital','battlemage','raider'],
  armor: ['sturdy','vital','ember','bastion','spellward'],
  charm: ['vital','ember','sharp','battlemage','spellward'],
};
export function affixSummary(affix: ItemAffix): string {
  const effects = affixBonuses(affix);
  const format = (amount:number) => `${amount >= 0 ? '+' : ''}${amount}`;
  const stats = [
    ['Attack', effects.attack], ['Spell', effects.spell],
    ['Armor', effects.armor], ['Health', effects.health],
  ] as const;
  const outcome = stats.filter(([, amount]) => amount !== 0)
    .map(([name, amount]) => `${format(amount)} ${name}`).join(' · ');
  return `${affix.label}${affix.tier ? ' · T' + affix.tier : ''}: ${outcome}`;
}
/** Affix tier is capped by item level; early Warden gear can access tier 2. */
export function maximumAffixTier(itemLevel: number): 1 | 2 | 3 {
  return itemLevel >= 17 ? 3 : itemLevel >= 8 ? 2 : 1;
}
export type ForgeOutcome = 'reforged' | 'erased' | 'cursed';
export interface LootItem {
  /** An item can be forged only once across its entire lifetime, including extraction/withdrawal. */
  forged?: true;
  forgeOutcome?: ForgeOutcome;
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
  const itemLevel = guardian ? 8 : kind === 'brute' ? 5 : 2 + (lootHash(dungeonSeed, enemyId, 71) % 3);
  const available = [...AFFIX_POOLS[slot]];
  const affixes: ItemAffix[] = [];
  for (let index = 0; index < affixCount; index++) {
    const selection = lootHash(dungeonSeed, enemyId, 50 + index) % available.length;
    const id = available.splice(selection, 1)[0];
    const maxTier = maximumAffixTier(itemLevel);
    const tier: 1 | 2 | 3 = maxTier === 1 ? 1
      : (lootHash(dungeonSeed, enemyId, 110 + index) % 100 < (guardian ? 75 : 45)
        ? maxTier : 1);
    // Level-gated, deterministic rolling. A tier label also makes close upgrades legible.
    const value = 1 + tier * 2 +
      (lootHash(dungeonSeed, enemyId, 80 + index) % (4 + tier * 3));
    affixes.push({ id, label: AFFIX_NAMES[id], value, tier });
  }
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

  /**
   * Return every individually reachable item in pickup range, ordered by
   * distance then ID. Grouped world symbols never merge item ownership or
   * bypass line-of-sight checks when the player chooses one to pick up.
   */
  nearbyItems(
    player: Point,
    canReach: (from: Point, to: Point) => boolean = () => true,
  ): GroundLoot[] {
    return this.ground.filter(drop =>
      Math.hypot(player.x - drop.position.x, player.y - drop.position.y) <= PICKUP_RADIUS &&
      canReach(player, drop.position)
    ).sort((a, b) =>
      Math.hypot(player.x - a.position.x, player.y - a.position.y) -
      Math.hypot(player.x - b.position.x, player.y - b.position.y) ||
      a.id.localeCompare(b.id)
    );
  }

  nearby(player: Point, canReach: (from: Point, to: Point) => boolean = () => true): GroundLoot | null {
    return this.nearbyItems(player, canReach)[0] ?? null;
  }

  pickUp(id: string, player: Point, canReach: (from: Point, to: Point) => boolean = () => true): PickupResult {
    const index = this.ground.findIndex(drop => drop.id === id);
    if (index < 0) return { status: 'not-found' };
    const drop = this.ground[index];
    if (Math.hypot(drop.position.x - player.x, drop.position.y - player.y) > PICKUP_RADIUS ||
        !canReach(player, drop.position)) {
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
