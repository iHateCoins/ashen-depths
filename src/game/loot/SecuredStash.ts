import { lootHash, AFFIX_NAMES, AFFIX_POOLS, maximumAffixTier, type LootItem, type ItemAffix } from './ExpeditionLoot';
import { ACTIVE_SKILLS, SKILL_SUPPORTS, SKILL_SLOT_LIMIT } from '../combat/AutoSkillSystem';
import { isValidUnlockId, UNLOCK_CHOICES } from '../combat/SkillProgression';
import { DEFAULT_CHARACTER_CLASS, isCharacterClassId, type CharacterClassId } from '../character/CharacterClasses';
import { clonePassiveLedger, validPassiveDepth, validPassiveLedger,
  type PassiveMilestoneLedger } from '../character/PassiveMilestones';
import { cloneAllocations, PassiveTreeProgress, validAllocationLedger,
  type PassiveAllocationLedger, type PassiveAllocationResult } from '../character/PassiveTrees';

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
  /** Explicit character creation; older save snapshots count as an existing character. */
  characterCreated?: boolean;
  /** Highest tower floor unlocked by an extracted Warden victory. */
  highestUnlockedDepth?: number;
  /** Skill-owned permanent support capacity, independently crafted per skill. */
  skillSockets?: Record<string, number>;
  /** Saved hideout skills and socket-limited supports. */
  skillLoadout?: { active: string[]; supports: Record<string, string[]> };
  items: LootItem[];
  /** Equipped item IDs reference secured items, not duplicate copies. */
  equippedItemIds?: string[];
  /** Absent in older schema-1 saves; treat as no learned skills. */
  unlocks?: string[];
  /** Optional since pre-M05 PR06 saves predate the forge. */
  forgeEmbers?: number;
  /** Optional until M07; all old saves default to the original Arcanist. */
  preferredClass?: CharacterClassId;
  /** Optional for pre-M07 saves. Each class secures each even Warden only once. */
  passiveMilestones?: PassiveMilestoneLedger;
  /** Missing in pre-PR04 saves. Order records valid, paid prerequisite paths. */
  passiveAllocations?: PassiveAllocationLedger;
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

export const MAX_SKILL_SOCKETS = 6;
export type SocketOutcome = 'removed' | 'unchanged' | 'added' | 'storage-error' | 'invalid-skill' | 'no-embers';
const skillIds = new Set(ACTIVE_SKILLS.map(skill => skill.id));
function validSockets(value: unknown): value is Record<string, number> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([id, count]) => skillIds.has(id) &&
      Number.isSafeInteger(count) && count >= 0 && count <= MAX_SKILL_SOCKETS);
}

function validSkillLoadout(value: unknown, sockets: Record<string, number> = {}): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as {active?: unknown; supports?: unknown};
  if (!Array.isArray(data.active) || data.active.length > SKILL_SLOT_LIMIT ||
      data.active.length === 0 || !data.active.every(id => typeof id === 'string' && skillIds.has(id)) ||
      new Set(data.active).size !== data.active.length || !data.supports ||
      typeof data.supports !== 'object' || Array.isArray(data.supports)) return false;
  const available = new Set(SKILL_SUPPORTS.map(s => s.id));
  const seen = new Set<string>();
  for (const [skill, supports] of Object.entries(data.supports)) {
    if (!data.active.includes(skill) || !Array.isArray(supports) ||
        supports.length > (sockets[skill] ?? 0)) return false;
    for (const support of supports) {
      if (typeof support !== 'string' || !available.has(support) || seen.has(support)) return false;
      seen.add(support);
    }
  }
  return true;
}

function parseSnapshot(raw: string): StashSnapshot | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const data = value as Partial<StashSnapshot>;
    if (data.schema !== 1 || !Number.isSafeInteger(data.revision) || data.revision! < 0 ||
        !Number.isSafeInteger(data.completed) || data.completed! < 0 ||
        (data.characterCreated !== undefined && typeof data.characterCreated !== 'boolean') ||
        (data.skillSockets !== undefined && !validSockets(data.skillSockets)) ||
        (data.skillLoadout !== undefined && !validSkillLoadout(data.skillLoadout, data.skillSockets)) ||
        (data.highestUnlockedDepth !== undefined &&
          (!Number.isSafeInteger(data.highestUnlockedDepth) ||
           data.highestUnlockedDepth < 1 || data.highestUnlockedDepth > 497)) ||
        !Array.isArray(data.items) || data.items.length > STASH_CAPACITY ||
        !data.items.every(validItem) ||
        (data.preferredClass !== undefined && !isCharacterClassId(data.preferredClass)) ||
        (data.passiveMilestones !== undefined && !validPassiveLedger(data.passiveMilestones)) ||
        (data.passiveAllocations !== undefined &&
          !validAllocationLedger(data.passiveAllocations, data.passiveMilestones ?? {})) ||
        (data.forgeEmbers !== undefined && (!Number.isSafeInteger(data.forgeEmbers) ||
          data.forgeEmbers < 0 || data.forgeEmbers > MAX_FORGE_EMBERS)) ||
        (data.unlocks !== undefined && (!Array.isArray(data.unlocks) ||
          data.unlocks.length > UNLOCK_CHOICES.length || !data.unlocks.every(isValidUnlockId) ||
          new Set(data.unlocks).size !== data.unlocks.length))) return null;
    const ids = data.items.map(item => item.id);
    if (new Set(ids).size !== ids.length) return null;
    if (data.equippedItemIds !== undefined) {
      if (!Array.isArray(data.equippedItemIds) || data.equippedItemIds.length > 3 ||
          data.equippedItemIds.some(id => typeof id !== 'string' || !ids.includes(id)) ||
          new Set(data.equippedItemIds).size !== data.equippedItemIds.length) return null;
      const equipped = data.items.filter(item => data.equippedItemIds!.includes(item.id));
      if (new Set(equipped.map(item => item.slot)).size !== equipped.length) return null;
    }
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
  get hasCharacter(): boolean { return this.data.characterCreated === true || (this.lastStored !== null && this.data.characterCreated !== false); }
  /** Creation is once per save. Legacy saves are never treated as blank. */
  createCharacter(id: CharacterClassId, startingSkillId?: string): boolean {
    if (this.state !== 'ready' || this.hasCharacter || !isCharacterClassId(id)) return false;
    const choices = id === 'vanguard' ? ['crescent-cleave','piercing-volley'] : ['cinder-burst','frost-bloom'];
    const selected = startingSkillId ?? choices[0];
    if (!choices.includes(selected)) return false;
    return this.commit({...this.data, revision:this.data.revision+1, characterCreated:true, preferredClass:id,
      skillLoadout:{active:[selected],supports:{[selected]:[]}}});
  }
  /** Destructive reset requires explicit UI confirmation. Existing corrupt saves are preserved. */
  deleteCharacter(): boolean {
    if (this.state !== 'ready') return false;
    const empty = freshSnapshot();
    return this.commit({...empty, revision:this.data.revision+1, characterCreated:false});
  }
  /** Legacy saves default to the first floor without resetting any stored rewards. */
  get highestUnlockedDepth(): number { return this.data.highestUnlockedDepth ?? 1; }
  socketsFor(skillId: string): number { return this.data.skillSockets?.[skillId] ?? 0; }
  get skillLoadout(): {active: string[]; supports: Record<string, string[]>} | null {
    if (!this.data.skillLoadout) return null;
    return {active: [...this.data.skillLoadout.active], supports: Object.fromEntries(
      Object.entries(this.data.skillLoadout.supports).map(([id, values]) => [id, [...values]]))};
  }
  saveSkillLoadout(active: readonly string[], supports: Record<string, string[]>): boolean {
    const loadout = {active: [...active], supports: Object.fromEntries(
      Object.entries(supports).map(([id, values]) => [id, [...values]]))};
    if (this.state !== 'ready' || !validSkillLoadout(loadout, this.data.skillSockets)) return false;
    return this.commit({...this.data, revision: this.data.revision + 1, skillLoadout: loadout});
  }
  /** Spend one secured Ember for an equip-independent skill capacity attempt. */
  craftSkillSocket(skillId: string): SocketOutcome {
    if (this.state !== 'ready') return 'storage-error';
    if (!skillIds.has(skillId)) return 'invalid-skill';
    if (this.forgeEmbers < 1) return 'no-embers';
    const hash = [...skillId].reduce((n, ch) => lootHash(n, ch.charCodeAt(0)), this.data.revision + 917);
    const outcome = hash % 3;
    const old = this.socketsFor(skillId);
    const nextCount = outcome === 0 ? Math.max(0, old - 1) :
      outcome === 2 ? Math.min(MAX_SKILL_SOCKETS, old + 1) : old;
    const nextLoadout = this.skillLoadout;
    if (nextLoadout?.supports[skillId]) nextLoadout.supports[skillId] = nextLoadout.supports[skillId].slice(0, nextCount);
    const next: StashSnapshot = {
      ...this.data, revision: this.data.revision + 1,
      forgeEmbers: this.forgeEmbers - 1,
      ...(nextLoadout ? {skillLoadout: nextLoadout} : {}),
      skillSockets: { ...this.data.skillSockets, [skillId]: nextCount },
    };
    if (!this.commit(next)) return 'storage-error';
    this.spendableEmbers = Math.max(0, this.spendableEmbers - 1);
    return nextCount < old ? 'removed' : nextCount > old ? 'added' : 'unchanged';
  }
  get items(): readonly LootItem[] { return this.data.items.map(cloneItem); }
  /** The character's retained loadout, stored within the same secured item inventory. */
  get equippedItems(): readonly LootItem[] {
    return this.data.items.filter(item => this.data.equippedItemIds?.includes(item.id)).map(cloneItem);
  }
  get unlockedIds(): readonly string[] { return [...(this.data.unlocks ?? [])]; }
  get forgeEmbers(): number { return this.data.forgeEmbers ?? 0; }
  get spendableForgeEmbers(): number { return this.spendableEmbers; }
  get passiveAllocations(): PassiveAllocationLedger {
    return cloneAllocations(this.data.passiveAllocations ?? {});
  }
  allocationsFor(classId: CharacterClassId): readonly string[] {
    return [...(this.data.passiveAllocations?.[classId] ?? [])];
  }
  /** Returns an explicit reason so UI can distinguish cap, prerequisite and failed saves. */
  allocatePassiveNode(classId: CharacterClassId,id: string):
    PassiveAllocationResult | 'storage-error' {
    if (this.state !== 'ready' || !isCharacterClassId(classId)) return 'storage-error';
    const progress = new PassiveTreeProgress(classId, this.allocationsFor(classId),
      this.passivePointsFor(classId));
    const result = progress.tryAllocate(id);
    if (result !== 'allocated') return result;
    const allocations = cloneAllocations(this.data.passiveAllocations ?? {});
    allocations[classId] = [...progress.allocations];
    const next: StashSnapshot = {
      ...this.data, revision: this.data.revision + 1, passiveAllocations: allocations,
    };
    return this.commit(next) ? 'allocated' : 'storage-error';
  }
  get passiveMilestones(): PassiveMilestoneLedger {
    return clonePassiveLedger(this.data.passiveMilestones ?? {});
  }
  passivePointsFor(classId: CharacterClassId): number {
    return this.data.passiveMilestones?.[classId]?.length ?? 0;
  }
  passiveDepthsFor(classId: CharacterClassId): readonly number[] {
    return [...(this.data.passiveMilestones?.[classId] ?? [])];
  }
  get preferredClass(): CharacterClassId {
    return this.data.preferredClass ?? DEFAULT_CHARACTER_CLASS;
  }

  /** Preference, not an earned reward: change only at the initial camp.
   * A one-write compare-and-set preserves the complete schema-1 stash.
   */
  selectCharacterClass(id: CharacterClassId): boolean {
    if (this.state !== 'ready' || this.hasCharacter || !isCharacterClassId(id)) return false;
    if (this.data.preferredClass === id) return true;
    return this.commit({ ...this.data, revision: this.data.revision + 1,
      preferredClass: id });
  }

  /** A successful Warden exit secures carried AND worn gear. */
  secureExpedition(
    items: readonly LootItem[], unlocks: readonly string[] = [],
    forgeEmbers = 0,
    passives?: { classId: CharacterClassId; depths: readonly number[] },
    defeatedWardenDepth?: number,
    wornIds: readonly string[] = [],
  ): StashOutcome {
    if (this.state !== 'ready') return this.failure();
    if (defeatedWardenDepth !== undefined &&
        (!Number.isSafeInteger(defeatedWardenDepth) ||
         defeatedWardenDepth < 1 || defeatedWardenDepth > 497)) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    if (!items.every(validItem) || new Set(items.map(item => item.id)).size !== items.length ||
        wornIds.length > 3 || new Set(wornIds).size !== wornIds.length ||
        wornIds.some(id => !items.some(item => item.id === id)) ||
        new Set(items.filter(item => wornIds.includes(item.id)).map(item => item.slot)).size !== wornIds.length) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    if (!unlocks.every(isValidUnlockId) || new Set(unlocks).size !== unlocks.length) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    if (!Number.isSafeInteger(forgeEmbers) || forgeEmbers < 0 ||
        this.forgeEmbers + forgeEmbers > MAX_FORGE_EMBERS) {
      return { ok: false, saved: 0, reason: 'invalid-items' };
    }
    // Validate before the one atomic write. A class can only claim the
    // Warden milestones it has not previously secured on this device.
    if (passives && (
      !isCharacterClassId(passives.classId) || !Array.isArray(passives.depths) ||
      passives.depths.some(depth => !validPassiveDepth(depth)) ||
      new Set(passives.depths).size !== passives.depths.length ||
      passives.depths.some(depth =>
        (this.data.passiveMilestones?.[passives.classId] ?? []).includes(depth))
    )) return { ok: false, saved: 0, reason: 'invalid-items' };
    const ledger = clonePassiveLedger(this.data.passiveMilestones ?? {});
    if (passives?.depths.length) {
      ledger[passives.classId] = [
        ...(ledger[passives.classId] ?? []), ...passives.depths,
      ].sort((a,b) => a-b);
    }
    if (!validPassiveLedger(ledger)) {
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
      characterCreated: this.hasCharacter,
      ...(this.data.skillSockets ? { skillSockets: { ...this.data.skillSockets } } : {}),
      ...(this.data.skillLoadout ? { skillLoadout: this.skillLoadout! } : {}),
      highestUnlockedDepth: Math.max(this.highestUnlockedDepth,
        defeatedWardenDepth === undefined ? 1 : Math.min(497, defeatedWardenDepth + 1)),
      items: [...this.data.items, ...secured],
      equippedItemIds: wornIds.length ? items.map((item, i) => wornIds.includes(item.id) ? secured[i].id : null)
        .filter((id): id is string => id !== null) : [...(this.data.equippedItemIds ?? [])],
      unlocks: [...new Set([...(this.data.unlocks ?? []), ...unlocks])],
      forgeEmbers: this.forgeEmbers + forgeEmbers,
      ...(this.data.preferredClass ? { preferredClass: this.data.preferredClass } : {}),
      ...(Object.keys(ledger).length || this.data.passiveMilestones !== undefined
        ? { passiveMilestones: ledger } : {}),
      ...(this.data.passiveAllocations
        ? { passiveAllocations: cloneAllocations(this.data.passiveAllocations) } : {}),
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

  /** Equip or unequip directly in the safe hideout without risking ownership. */
  setHideoutEquipment(slot: LootItem['slot'], itemId: string | null): boolean {
    if (this.state !== 'ready' || !(['weapon','armor','charm'] as string[]).includes(slot)) return false;
    const item = itemId === null ? null : this.data.items.find(owned => owned.id === itemId);
    if (itemId !== null && (!item || item.slot !== slot)) return false;
    const current = this.data.equippedItemIds ?? [];
    const kept = current.filter(id => this.data.items.find(owned => owned.id === id)?.slot !== slot);
    const nextIds = item ? [...kept, item.id] : kept;
    if (current.length === nextIds.length && current.every(id => nextIds.includes(id))) return true;
    return this.commit({
      ...this.data,
      revision: this.data.revision + 1,
      equippedItemIds: nextIds,
    });
  }

  /**
   * Commit the transfer of every equipped item from safe storage into an
   * at-risk expedition, in one write. Never returns equipment on failure.
   * Death must not put these items back; extraction is the only secure path.
   */
  withdrawEquippedForExpedition(): LootItem[] | null {
    if (this.state !== 'ready') return null;
    const equipped = this.equippedItems;
    if (equipped.length === 0) return [];
    const ids = new Set(equipped.map(item => item.id));
    const next: StashSnapshot = {
      ...this.data,
      revision: this.data.revision + 1,
      items: this.data.items.filter(item => !ids.has(item.id)),
      equippedItemIds: [],
    };
    if (!this.commit(next)) return null;
    return equipped.map(cloneItem);
  }

  /** Remove a secured item BEFORE placing it in the risky expedition bag. */
  withdraw(id: string): LootItem | null {
    if (this.state !== 'ready') return null;
    const index = this.data.items.findIndex(item => item.id === id);
    if (index < 0) return null;
    const withdrawn = cloneItem(this.data.items[index]);
    const next = { ...this.data, revision: this.data.revision + 1,
      items: this.data.items.filter(item => item.id !== id),
      equippedItemIds: (this.data.equippedItemIds ?? []).filter(worn => worn !== id) };
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
