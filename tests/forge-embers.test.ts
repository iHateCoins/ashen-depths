import { describe, expect, it } from 'vitest';
import {
  SkillProgression, UNLOCK_CHOICES,
} from '../src/game/combat/SkillProgression';
import {
  SecuredStash, STASH_STORAGE_KEY, type StashStorage,
} from '../src/game/loot/SecuredStash';
import type { LootItem } from '../src/game/loot/ExpeditionLoot';

class MemoryStorage implements StashStorage {
  readonly values = new Map<string, string>();
  failWrite = false;
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error('quota');
    this.values.set(key, value);
  }
}

const item = (id: string, rarity: LootItem['rarity'] = 'rare'): LootItem => ({
  id, name: 'Forgotten Iron Cleaver', baseName: 'Iron Cleaver',
  rarity, slot: 'weapon', itemLevel: 8,
  affixes: rarity === 'common' ? [] : rarity === 'magic'
    ? [{ id: 'sharp', label: 'Attack Power', value: 7 }]
    : [
      { id: 'sharp', label: 'Attack Power', value: 7 },
      { id: 'ember', label: 'Ember Potency', value: 9 },
    ],
});

describe('repeatable Forge Ember discovery and gear reforging', () => {
  it('always offers a currency choice even after all eight permanent unlocks', () => {
    const progress = new SkillProgression(UNLOCK_CHOICES.map(choice => choice.id));
    expect(progress.availableChoices).toHaveLength(0);
    expect(progress.rewardChoices.map(choice => choice.id)).toEqual(['forge:ember']);
    expect(progress.offer('cache')).toBe(true);
    expect(progress.choose('cache', 'forge:ember')).toBe(true);
    expect(progress.offer('warden')).toBe(true);
    expect(progress.choose('warden', 'forge:ember')).toBe(true);
    expect(progress.pendingForgeEmbers).toBe(2);
    expect(progress.pendingUnlocks).toHaveLength(0);
    expect(progress.choose('warden', 'forge:ember')).toBe(false);
  });

  it('allows new players to choose either a permanent unlock or one Ember per reward', () => {
    const progress = new SkillProgression();
    progress.offer('cache');
    expect(progress.rewardChoices.some(choice => choice.id === 'skill:frost-bloom')).toBe(true);
    expect(progress.rewardChoices.some(choice => choice.id === 'forge:ember')).toBe(true);
    expect(progress.choose('cache', 'forge:ember')).toBe(true);
    progress.offer('warden');
    expect(progress.choose('warden', 'skill:frost-bloom')).toBe(true);
    expect(progress.pendingForgeEmbers).toBe(1);
    expect(progress.pendingUnlocks).toEqual(['skill:frost-bloom']);
    expect(progress.canUseSkill('frost-bloom')).toBe(false);
  });

  it('secures items, learned skills and Embers in one atomic expedition write', () => {
    const store = new MemoryStorage();
    const stash = new SecuredStash(store);
    store.failWrite = true;
    expect(stash.secureExpedition([item('rare')], ['skill:arc-relay'], 1)).toMatchObject({ ok: false });
    expect(stash.count).toBe(0);
    expect(stash.forgeEmbers).toBe(0);
    expect(stash.unlockedIds).toEqual([]);
    store.failWrite = false;
    expect(stash.secureExpedition([item('rare')], ['skill:arc-relay'], 1))
      .toMatchObject({ ok: true, saved: 1 });
    const reloaded = new SecuredStash(store);
    expect(reloaded.forgeEmbers).toBe(1);
    expect(reloaded.unlockedIds).toContain('skill:arc-relay');
    expect(reloaded.items).toHaveLength(1);
  });

  it('reforges exactly one safe rare affix and consumes one Ember on successful write', () => {
    const store = new MemoryStorage();
    const stash = new SecuredStash(store);
    stash.secureExpedition([item('rare'), item('other')], [], 2);
    const before = stash.items[0];
    // Embers obtained in this run are not usable until the NEXT expedition.
    expect(stash.reforgeItem(before.id, 0)).toBe(false);
    const later = new SecuredStash(store);
    const other = later.items[1];
    expect(later.reforgeItem(before.id, 0)).toBe(true);
    const after = later.items[0];
    expect(later.forgeEmbers).toBe(1);
    expect(later.spendableForgeEmbers).toBe(1);
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);
    expect(after.rarity).toBe(before.rarity);
    expect(after.itemLevel).toBe(before.itemLevel);
    expect(after.forged).toBe(true);
    expect(['erased','cursed','reforged']).toContain(after.forgeOutcome);
    if (after.forgeOutcome === 'erased') {
      expect(after.affixes).toHaveLength(1);
      expect(after.affixes[0]).toEqual(before.affixes[1]);
    } else {
      expect(after.affixes[1]).toEqual(before.affixes[1]);
      expect(after.affixes[0]).not.toEqual(before.affixes[0]);
      if (after.forgeOutcome === 'cursed') {
        expect(after.affixes[0].value).toBe(-before.affixes[0].value);
      }
    }
    expect(later.items[1]).toEqual(other);
    expect(later.reforgeItem(before.id, 0)).toBe(false);
    expect(new SecuredStash(store).items).toEqual(later.items);
  });

  it('cannot forge common, missing, out-of-range, or unsecured items, even with currency', () => {
    const store = new MemoryStorage();
    const stash = new SecuredStash(store);
    stash.secureExpedition([item('common', 'common'), item('magic', 'magic')], [], 2);
    const snapshot = store.getItem(STASH_STORAGE_KEY);
    expect(stash.reforgeItem(stash.items[0].id, 0)).toBe(false);
    expect(stash.reforgeItem('not-in-stash', 0)).toBe(false);
    expect(stash.reforgeItem(stash.items[1].id, -1)).toBe(false);
    expect(stash.reforgeItem(stash.items[1].id, 2)).toBe(false);
    expect(store.getItem(STASH_STORAGE_KEY)).toBe(snapshot);
    expect(stash.forgeEmbers).toBe(2);
  });

  it('failed reforge writes, stale tabs and zero currency never change equipment', () => {
    const store = new MemoryStorage();
    const stash = new SecuredStash(store);
    stash.secureExpedition([item('rare')], [], 1);
    const active = new SecuredStash(store);
    const stale = new SecuredStash(store);
    const id = active.items[0].id;
    const before = store.getItem(STASH_STORAGE_KEY);
    store.failWrite = true;
    expect(active.reforgeItem(id, 0)).toBe(false);
    expect(store.getItem(STASH_STORAGE_KEY)).toBe(before);
    expect(active.forgeEmbers).toBe(1);
    store.failWrite = false;
    expect(active.reforgeItem(id, 0)).toBe(true);
    expect(stale.reforgeItem(id, 0)).toBe(false);
    expect(active.reforgeItem(id, 0)).toBe(false);
    expect(active.forgeEmbers).toBe(0);
    expect(new SecuredStash(store).items).toEqual(active.items);
  });

  it('samples all three 25/20/55 forge outcomes deterministically and always locks the item', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const store = new MemoryStorage();
      const original = item(`forged-${seed}`);
      const raw = JSON.stringify({
        schema: 1, revision: 1 + seed, completed: 1,
        items: [original], forgeEmbers: 1,
      });
      store.values.set(STASH_STORAGE_KEY, raw);
      const loaded = new SecuredStash(store);
      expect(loaded.reforgeItem(original.id, 0)).toBe(true);
      const after = new SecuredStash(store).items[0];
      seen.add(after.forgeOutcome!);
      expect(after.forged).toBe(true);
      expect(after.id).toBe(original.id);
      if (after.forgeOutcome === 'erased') {
        expect(after.affixes).toEqual([original.affixes[1]]);
      } else if (after.forgeOutcome === 'cursed') {
        expect(after.affixes[0].value).toBe(-7);
        expect(after.affixes[1]).toEqual(original.affixes[1]);
      } else {
        expect(after.affixes[0]).not.toEqual(original.affixes[0]);
        expect(after.affixes[1]).toEqual(original.affixes[1]);
      }
      expect(new SecuredStash(store).reforgeItem(original.id, 0)).toBe(false);
    }
    expect([...seen].sort()).toEqual(['cursed', 'erased', 'reforged']);
  });

  it('once-forged equipment remains unusable at the forge after withdrawal and re-extraction', () => {
    const store = new MemoryStorage();
    const stash = new SecuredStash(store);
    stash.secureExpedition([item('legacy')], [], 2);
    const next = new SecuredStash(store);
    const id = next.items[0].id;
    expect(next.reforgeItem(id, 0)).toBe(true);
    const withdrawn = next.withdraw(id)!;
    expect(withdrawn.forged).toBe(true);
    expect(next.secureExpedition([withdrawn], [], 0).ok).toBe(true);
    const later = new SecuredStash(store);
    expect(later.forgeEmbers).toBe(1);
    expect(later.items[0].forged).toBe(true);
    expect(later.reforgeItem(later.items[0].id, 0)).toBe(false);
  });

  it('loads pre-forge schema-1 stashes with no currency and rejects malformed values', () => {
    const store = new MemoryStorage();
    store.values.set(STASH_STORAGE_KEY,
      JSON.stringify({ schema: 1, revision: 1, completed: 1, items: [item('legacy')] }));
    const stash = new SecuredStash(store);
    expect(stash.status).toBe('ready');
    expect(stash.forgeEmbers).toBe(0);
    expect(stash.secureExpedition([], [], 1).ok).toBe(true);
    expect(new SecuredStash(store).forgeEmbers).toBe(1);
    for (const invalid of [-1, 1.5, '2', 1000000]) {
      const corrupted = new MemoryStorage();
      const snapshot = JSON.stringify({
        schema: 1, revision: 1, completed: 1, items: [], forgeEmbers: invalid,
      });
      corrupted.values.set(STASH_STORAGE_KEY, snapshot);
      const loaded = new SecuredStash(corrupted);
      expect(loaded.status).toBe('corrupt');
      expect(loaded.secureExpedition([]).ok).toBe(false);
      expect(corrupted.getItem(STASH_STORAGE_KEY)).toBe(snapshot);
    }
  });
});
