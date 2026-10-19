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
    const other = stash.items[1];
    expect(stash.reforgeItem(before.id, 0)).toBe(true);
    const after = stash.items[0];
    expect(stash.forgeEmbers).toBe(1);
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);
    expect(after.rarity).toBe(before.rarity);
    expect(after.itemLevel).toBe(before.itemLevel);
    expect(after.affixes[0]).not.toEqual(before.affixes[0]);
    expect(after.affixes[1]).toEqual(before.affixes[1]);
    expect(stash.items[1]).toEqual(other);
    expect(new SecuredStash(store).items).toEqual(stash.items);
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
    const stale = new SecuredStash(store);
    const id = stash.items[0].id;
    const before = store.getItem(STASH_STORAGE_KEY);
    store.failWrite = true;
    expect(stash.reforgeItem(id, 0)).toBe(false);
    expect(store.getItem(STASH_STORAGE_KEY)).toBe(before);
    expect(stash.forgeEmbers).toBe(1);
    store.failWrite = false;
    expect(stash.reforgeItem(id, 0)).toBe(true);
    expect(stale.reforgeItem(id, 0)).toBe(false);
    expect(stash.reforgeItem(id, 0)).toBe(false);
    expect(stash.forgeEmbers).toBe(0);
    expect(new SecuredStash(store).items).toEqual(stash.items);
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
