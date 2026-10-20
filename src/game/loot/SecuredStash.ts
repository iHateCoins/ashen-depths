import { lootHash, AFFIX_NAMES, AFFIX_POOLS, maximumAffixTier, type LootItem, type ItemAffix } from './ExpeditionLoot';
import { isValidUnlockId, UNLOCK_CHOICES } from '../combat/SkillProgression';
import { DEFAULT_CHARACTER_CLASS, isCharacterClassId, type CharacterClassId } from '../character/CharacterClasses';

export const STASH_STORAGE_KEY = 'ashen-depths-stash-v1';
export const STASH_CAPACITY = 500;
export const MAX_FORGE_EMBERS = 999999;
/** One-use forge attempt outcomes: 25% lose affix, 20% become cursed, 55% reroll. */
export const FORGE_ODDS = { erased: 25, cursed: 20, reforged: 55 } as const;

export interface StashStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StashSnapshot {
  schema: 1;
  revision: number;
  completed: number;
  items: LootItem[];
  /** Absent in older schema-1 saves; treat as no learned skills. */
  unlocks?: string[];
  /** Optional since pre-M05 PR06 saves predate the forge. */
  forgeEmbers?: number;
  /** Optional until M07; all old saves default to the original Arcanist. */
  preferredClass?: CharacterClassId;
}

export type StashStatus = 'ready' | 'unavailable' | 'corrupt';
export interface StashOutcome {
  ok: boolean;
  saved: number;
  reason?: 'storage-unavailable' | 'storage-corrupt' | 'storage-full' | 'invalid-items';
}

function freshSnapshot(): StashSnapshot {
  return { schema: 1, revision: 0, completed: 0, items: [] };
}

function validItem(value: unknown): value is LootItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<LootItem>;
  if (typeof item.id !== 'string' || !item.id || item.id.length > 160 ||
      typeof item.name !== 'string' || !item.name || item.name.length > 140 ||
      typeof item.baseName !== 'string' || !item.baseName || item.baseName.length > 140 ||
      (item.baseStats !== undefined && (
        typeof item.baseStats !== 'object' || item.baseStats === null ||
        !(['attack', 'spell', 'armor', 'health'] as const).every(stat =>
          Number.isSafeInteger(item.baseStats?.[stat]) &&
          item.baseStats![stat] >= 0 && item.baseStats![stat] <= 10000)
      )) ||
      !(['common','magic','rare'] as unknown[]).includes(item.rarity) ||
      !(['weapon','armor','charm'] as unknown[]).includes(item.slot) ||
      !Number.isInteger(item.itemLevel) || item.itemLevel! < 1 || item.itemLevel! > 1000 ||
      !Array.isArray(item.affixes) || item.affixes.length > 8 ||
      (item.forged !== undefined && item.forged !== true) ||
      (item.forgeOutcome !== undefined && !['erased', 'cursed', 'reforged'].includes(item.forgeOutcome)) ||
      (item.forged === true) !== (item.forgeOutcome !== undefined)) return false;

  return item.affixes.every(affix =>
    affix && typeof affix === 'object' &&
    Object.prototype.hasOwnProperty.call(AFFIX_NAMES, affix.id) &&
    (affix.tier === undefined || ([1, 2, 3].includes(affix.tier) && affix.tier <= maximumAffixTier(item.itemLevel!))) &&
    typeof affix.label === 'string' && affix.label.length <= 120 &&
    Number.isFinite(affix.value) &&
    affix.value >= (item.forged ? -10000 : 0) && affix.value <= 10000
  );
}

function parseSnapshot(raw: string): StashSnapshot | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const data = value as Partial<StashSnapshot>;
    if (data.schema !== 1 || !Number.isSafeInteger(data.revision) || data.revision! < 0 ||
        !Number.isSafeInteger(data.completed) || data.completed! < 0 ||
        !Array.isArray(data.items) || data.items.length > STASH_CAPACITY ||
        !data.items.every(validItem) ||
        (data.preferredClass !== undefined && !isCharacterClassId(data.preferredClass)) ||
        (data.forgeEmbers !== undefined && (!Number.isSafeInteger(data.forgeEmbers) ||
          data.forgeEmbers < 0 || data.forgeEmbers > MAX_FORGE_EMBERS)) ||
        (data.unlocks !== undefined && (!Array.isArray(data.unlocks) ||
          data.unlocks.length > UNLOCK_CHOICES.length || !data.unlocks.every(isValidUnlockId) ||
          new Set(data.unlocks).size !== data.unlocks.length))) return null;
    const ids = data.items.map(item => item.id);
    if (new Set(ids).size !== ids.length) return null;
    return data as StashSnapshot;
  } catch {
    return null;
  }
}

function tryStorage(): StashStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function cloneItem(item: LootItem): LootItem {
  return {
    ...item,
    ...(item.baseStats ? { baseStats: { ...item.baseStats } } : {}),
    affixes: item.affixes.map(affix => ({ ...affix })),
  };
}

/**
 * Small, versioned on-device stash. A single atomic localStorage write moves
 * ownership; failing writes must NEVER claim gear is secured or withdrawn.
 * Invalid existing saves are preserved, not silently overwritten.
 */
export class SecuredStash {
  private data = freshSnapshot();
  private state: StashStatus = 'ready';
  private lastStored: string | null = null;
  /** Currency acquired during THIS run cannot be forged until a new run loads. */
  private spendableEmbers = 0;

  constructor(private readonly storage: StashStorage | null = tryStorage()) {
    if (!this.storage) {
      this.state = 'unavailable';
      return;
    }
    try {
      const raw = this.storage.getItem(STASH_STORAGE_KEY);
      this.lastStored = raw;
      if (raw !== null) {
        const loaded = parseSnapshot(raw);
        if (!loaded) {
          this.state = 'corrupt';
          return;
        }
        this.data = loaded;
        this.spendableEmbers = loaded.forgeEmbers ?? 0;
      }
    } catch {
      this.state = 'unavailable';
    }
  }

  get status(): StashStatus { return this.state; }
  get count(): number { return this.data.items.length; }
  get completedExpeditions(): number { return this.data.completed; }
  get items(): readonly LootItem[] { return this.data.items.map(cloneItem); }
  get unlockedIds(): readonly string[] { return [...(this.data.unlocks ?? [])]; }
  get forgeEmbers(): number { return this.data.forgeEmbers ?? 0; }
  get spendableForgeEmbers(): number { return this.spendableEmbers; }
  get preferredClass(): CharacterClassId {
    return this.data.preferredClass ?? DEFAULT_CHARACTER_CLASS;
  }

  /** Preference, not an earned reward: change only at the initial camp.
   * A one-write compare-and-set preserves the complete schema-1 stash.
   */
  selectCharacterClass(id: CharacterClassId): boolean {
    if (this.state !== 'ready' || !isCharacterClassId(id)) return false;
    if (this.data.preferredClass === id) return true;
    return this.commit({ ...this.data, revision: this.data.revision + 1,
      preferredClass: id });
  }

  /** A successful Warden exit secures carried AND worn gear. */
  secureExpedition(
    items: readonly LootItem[], unlocks: readonly string[] = [],
    forgeEmbers = 0,
  ): StashOutcome {
    if (this.state !== 'ready') return this.failure();
    if (!items.every(validItem) || new Set(items.map(item => item.id)).size !== items.length) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    if (!unlocks.every(isValidUnlockId) || new Set(unlocks).size !== unlocks.length) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    if (!Number.isSafeInteger(forgeEmbers) || forgeEmbers < 0 ||
        this.forgeEmbers + forgeEmbers > MAX_FORGE_EMBERS) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    if (this.data.items.length + items.length > STASH_CAPACITY) {
      return { ok: false, saved: 0, reason: 'storage-full' };
    }
    const revision = this.data.revision + 1;
    if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(this.data.completed + 1)) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    const secured = items.map((item, index) => ({
      ...cloneItem(item),
      // Multiple successful expeditions with a fixed ?seed must never produce
      // indistinguishable item IDs or allow an item to be claimed twice.
      id: `secure-${revision}-${index}`,
    }));
    const next: StashSnapshot = {
      schema: 1,
      revision,
      completed: this.data.completed + 1,
      items: [...this.data.items, ...secured],
      unlocks: [...new Set([...(this.data.unlocks ?? []), ...unlocks])],
      forgeEmbers: this.forgeEmbers + forgeEmbers,
      ...(this.data.preferredClass ? { preferredClass: this.data.preferredClass } : {}),
    };
    if (!this.commit(next)) return this.failure();
    return { ok: true, saved: secured.length };
  }

  /**
   * One irreversible attempt per item across the lifetime of the equipment.
   * 25% deletes the selected affix, 20% reverses its bonus into a penalty,
   * 55% rerolls a legal affix. Persists the one-time marker and Ember spend
   * atomically; all other affixes and item identity remain intact.
   */
  reforgeItem(id: string, affixIndex: number): boolean {
    if (this.state !== 'ready' || this.spendableEmbers < 1 ||
        !Number.isInteger(affixIndex)) return false;
    const index = this.data.items.findIndex(item => item.id === id);
    if (index < 0) return false;
    const original = this.data.items[index];
    if (original.rarity === 'common' || original.forged === true || affixIndex < 0 ||
        affixIndex >= original.affixes.length) return false;
    const nextItem = cloneItem(original);
    const old = nextItem.affixes[affixIndex];
    const allowed = AFFIX_POOLS[original.slot];
    const candidates = allowed.filter(affix =>
      !nextItem.affixes.some((other, i) => i !== affixIndex && other.id === affix));
    if (!candidates.length) return false;
    const itemHash = [...id].reduce((state, char) =>
      lootHash(state, char.charCodeAt(0)), 0xFACE);
    const random = lootHash(itemHash, this.data.revision, affixIndex, original.itemLevel);
    const outcome = random % 100;
    if (outcome < FORGE_ODDS.erased) {
      nextItem.affixes.splice(affixIndex, 1);
      nextItem.forgeOutcome = 'erased';
    } else if (outcome < FORGE_ODDS.erased + FORGE_ODDS.cursed) {
      nextItem.affixes[affixIndex] = { ...old, value: -Math.abs(old.value) };
      nextItem.forgeOutcome = 'cursed';
    } else {
      const affixId = candidates[lootHash(random, 0xA11CE) % candidates.length];
      // Forge keeps the item's level and follows the same level-gated affix tiers.
      const tier = maximumAffixTier(original.itemLevel);
      const valueRoll = lootHash(random, 0xBEEF);
      let value = 1 + tier * 2 + (valueRoll % (4 + tier * 3));
      if (affixId === old.id && value === old.value) {
        value = 1 + tier * 2 + ((value - tier * 2) % (4 + tier * 3));
      }
      nextItem.affixes[affixIndex] = {
        id: affixId, label: AFFIX_NAMES[affixId], tier, value,
      };
      nextItem.forgeOutcome = 'reforged';
    }
    nextItem.forged = true;
    const next: StashSnapshot = {
      ...this.data,
      revision: this.data.revision + 1,
      forgeEmbers: this.forgeEmbers - 1,
      items: this.data.items.map((item, i) => i === index ? nextItem : item),
    };
    if (!this.commit(next)) return false;
    this.spendableEmbers--;
    return true;
  }

  /** Remove a secured item BEFORE placing it in the risky expedition bag. */
  withdraw(id: string): LootItem | null {
    if (this.state !== 'ready') return null;
    const index = this.data.items.findIndex(item => item.id === id);
    if (index < 0) return null;
    const withdrawn = cloneItem(this.data.items[index]);
    const next = { ...this.data, revision: this.data.revision + 1,
      items: this.data.items.filter(item => item.id !== id) };
    if (!this.commit(next)) return null;
    return withdrawn;
  }

  private commit(next: StashSnapshot): boolean {
    if (this.state !== 'ready' || !this.storage) return false;
    try {
      // Avoid overwriting a more recent save from another open game tab.
      if (this.storage.getItem(STASH_STORAGE_KEY) !== this.lastStored) return false;
      const serialized = JSON.stringify(next);
      this.storage.setItem(STASH_STORAGE_KEY, serialized);
      this.lastStored = serialized;
      this.data = next;
      return true;
    } catch {
      // An unavailable or quota-exceeded store must never report success.
      return false;
    }
  }

  private failure(): StashOutcome {
    return {
      ok: false, saved: 0,
      reason: this.state === 'corrupt' ? 'storage-corrupt' : 'storage-unavailable',
    };
  }
}
