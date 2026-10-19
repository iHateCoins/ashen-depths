import type { EquipmentSlot, ExpeditionLoot, LootItem } from './ExpeditionLoot';

export interface EquipmentStats {
  /** Bonus to the 25-damage automatic basic attack. */
  attack: number;
  /** Bonus to the 35-damage Cinder Burst and future ember skills. */
  spell: number;
  /** Flat damage reduction on enemy contact strikes, with minimum 1 damage. */
  armor: number;
  /** Bonus above the player's 100 base maximum HP. */
  health: number;
}
export type EquipmentActionResult = 'equipped' | 'unequipped' | 'not-found' | 'bag-full' | 'empty';

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['weapon', 'armor', 'charm'];

/** Flat armor mitigates enemy contact damage but never makes a hit harmless. */
export function mitigatedHitDamage(rawDamage: number, armor: number): number {
  if (!Number.isFinite(rawDamage) || rawDamage <= 0) return 0;
  const resistance = Number.isFinite(armor) ? Math.max(0, Math.floor(armor)) : 0;
  return Math.max(1, Math.floor(rawDamage) - resistance);
}

function emptyStats(): EquipmentStats {
  return { attack: 0, spell: 0, armor: 0, health: 0 };
}

/**
 * Common items must still be meaningful: bases give a modest stat bonus and
 * rarity modifiers stack on top. All modifiers were generated as item data
 * in M04 PR01; the same immutable item objects are used when worn or carried.
 */
export function itemBonuses(item: LootItem): EquipmentStats {
  const stats = emptyStats();
  if (item.slot === 'weapon') stats.attack += 4 + item.itemLevel;
  else if (item.slot === 'armor') stats.armor += 1 + Math.floor(item.itemLevel / 2);
  else stats.spell += 2 + Math.floor(item.itemLevel / 2);

  for (const affix of item.affixes) {
    if (affix.id === 'sharp') stats.attack += affix.value;
    else if (affix.id === 'ember') stats.spell += affix.value;
    else if (affix.id === 'sturdy') stats.armor += affix.value;
    else if (affix.id === 'vital') stats.health += affix.value;
  }
  return stats;
}

function addStats(sum: EquipmentStats, next: EquipmentStats): void {
  sum.attack += next.attack;
  sum.spell += next.spell;
  sum.armor += next.armor;
  sum.health += next.health;
}

/**
 * Equipment and bag are separate ownership locations. Equip moves a real item
 * out of the 24-slot bag and replaces the slot's old item into the bag in one
 * atomic transaction; unequip requires an empty bag slot.
 *
 * Both worn and carried items remain UNSAVED/UNSECURED until extraction exists.
 */
export class EquipmentLoadout {
  private readonly worn: Record<EquipmentSlot, LootItem | null> = {
    weapon: null, armor: null, charm: null,
  };

  constructor(private readonly loot: ExpeditionLoot) {}

  get(slot: EquipmentSlot): LootItem | null { return this.worn[slot]; }

  get equippedCount(): number {
    return EQUIPMENT_SLOTS.filter(slot => this.worn[slot] !== null).length;
  }

  get stats(): EquipmentStats {
    return this.statsWith();
  }

  /** Compare a bag item against whatever is currently in that slot. */
  previewEquip(candidate: LootItem): EquipmentStats {
    return this.statsWith(candidate);
  }

  /** If the candidate replaces a worn item, nothing is duplicated or lost. */
  equip(itemId: string): EquipmentActionResult {
    const index = this.loot.bag.findIndex(item => item.id === itemId);
    if (index < 0) return 'not-found';
    const item = this.loot.bag[index];
    const displaced = this.worn[item.slot];
    this.loot.bag.splice(index, 1);
    if (displaced) this.loot.bag.push(displaced);
    this.worn[item.slot] = item;
    return 'equipped';
  }

  unequip(slot: EquipmentSlot): EquipmentActionResult {
    const item = this.worn[slot];
    if (!item) return 'empty';
    if (this.loot.bagFull) return 'bag-full';
    this.worn[slot] = null;
    this.loot.bag.push(item);
    return 'unequipped';
  }

  private statsWith(candidate?: LootItem): EquipmentStats {
    const stats = emptyStats();
    for (const slot of EQUIPMENT_SLOTS) {
      const item = candidate?.slot === slot ? candidate : this.worn[slot];
      if (item) addStats(stats, itemBonuses(item));
    }
    return stats;
  }
}
