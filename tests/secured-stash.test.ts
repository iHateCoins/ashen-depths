import { describe, expect, it } from 'vitest';
import {
  SecuredStash, STASH_CAPACITY, STASH_STORAGE_KEY, type StashStorage,
} from '../src/game/loot/SecuredStash';
import type { LootItem } from '../src/game/loot/ExpeditionLoot';

function item(id: string, slot: LootItem['slot'] = 'weapon'): LootItem {
  return {
    id, name: `Forged ${id}`, baseName: 'Forged Sword', slot,
    itemLevel: 5, rarity: 'magic',
    affixes: [{ id: 'sharp', label: 'Attack Power', value: 6 }],
  };
}

class MemoryStorage implements StashStorage {
  readonly values = new Map<string, string>();
  failWrite = false;
  failRead = false;
  getItem(key: string): string | null {
    if (this.failRead) throw new Error('Storage access denied');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error('Storage quota exceeded');
    this.values.set(key, value);
  }
}

describe('secured stash persistence and transactions', () => {
  it('equips from the safe hideout without withdrawing or duplicating items', () => {
    const storage = new MemoryStorage();
    const stash = new SecuredStash(storage);
    stash.secureExpedition([item('one'), item('two'), item('armor', 'armor')]);
    const [one, two, armor] = stash.items;
    expect(stash.setHideoutEquipment('weapon', one.id)).toBe(true);
    expect(stash.items).toHaveLength(3);
    expect(stash.equippedItems.map(value => value.id)).toEqual([one.id]);
    expect(stash.setHideoutEquipment('weapon', two.id)).toBe(true);
    expect(stash.setHideoutEquipment('armor', armor.id)).toBe(true);
    expect(stash.equippedItems.map(value => value.id)).toEqual([two.id, armor.id]);
    expect(stash.setHideoutEquipment('weapon', armor.id)).toBe(false);
    storage.failWrite = true;
    expect(stash.setHideoutEquipment('weapon', null)).toBe(false);
    expect(stash.equippedItems.map(value => value.id)).toContain(two.id);
    storage.failWrite = false;
    expect(stash.setHideoutEquipment('weapon', null)).toBe(true);
    expect(new SecuredStash(storage).equippedItems.map(value => value.id)).toEqual([armor.id]);
  });

  it('moves retained gear out of safe ownership in one atomic departure', () => {
    const storage = new MemoryStorage();
    const stash = new SecuredStash(storage);
    expect(stash.secureExpedition([item('blade'), item('spare', 'armor')], [], 0, undefined, 1, ['blade']).ok).toBe(true);
    expect(stash.equippedItems).toHaveLength(1);
    storage.failWrite = true;
    expect(stash.withdrawEquippedForExpedition()).toBeNull();
    expect(stash.equippedItems).toHaveLength(1);
    expect(stash.items).toHaveLength(2);
    storage.failWrite = false;
    const risked = stash.withdrawEquippedForExpedition();
    expect(risked?.map(gear => gear.slot)).toEqual(['weapon']);
    expect(stash.equippedItems).toHaveLength(0);
    expect(stash.items).toHaveLength(1);
    expect(new SecuredStash(storage).items).toHaveLength(1);
    expect(stash.withdrawEquippedForExpedition()).toEqual([]);
  });

  it('persists equipped ownership through extraction and reload without duplicating items', () => {
    const storage = new MemoryStorage();
    const stash = new SecuredStash(storage);
    expect(stash.secureExpedition([item('weapon'), item('armor', 'armor')], [], 0, undefined, 1, ['weapon']))
      .toMatchObject({ ok: true, saved: 2 });
    expect(stash.equippedItems).toHaveLength(1);
    expect(stash.equippedItems[0].slot).toBe('weapon');
    expect(new SecuredStash(storage).equippedItems).toEqual(stash.equippedItems);
    expect(stash.secureExpedition([item('next', 'armor')], [], 0, undefined, 2, ['next']))
      .toMatchObject({ ok: true });
    expect(stash.equippedItems.map(gear => gear.slot)).toEqual(['armor']);
    expect(stash.items).toHaveLength(3);
    const wornId = stash.equippedItems[0].id;
    expect(stash.withdraw(wornId)?.slot).toBe('armor');
    expect(stash.equippedItems).toHaveLength(0);
    expect(new SecuredStash(storage).equippedItems).toHaveLength(0);
  });

  it('keeps skill socket capacities separate and bounds zero through six', () => {
    const storage = new MemoryStorage();
    const stash = new SecuredStash(storage);
    expect(stash.socketsFor('cinder-burst')).toBe(0);
    expect(stash.socketsFor('frost-bloom')).toBe(0);
    expect(stash.craftSkillSocket('unknown')).toBe('invalid-skill');
    expect(stash.craftSkillSocket('cinder-burst')).toBe('no-embers');
    expect(stash.secureExpedition([], [], 40).ok).toBe(true);
    for (let i = 0; i < 35; i++) {
      const result = stash.craftSkillSocket('cinder-burst');
      expect(['removed', 'unchanged', 'added']).toContain(result);
      expect(stash.socketsFor('cinder-burst')).toBeGreaterThanOrEqual(0);
      expect(stash.socketsFor('cinder-burst')).toBeLessThanOrEqual(6);
    }
    expect(stash.forgeEmbers).toBe(5);
    expect(new SecuredStash(storage).socketsFor('cinder-burst'))
      .toBe(stash.socketsFor('cinder-burst'));
    expect(new SecuredStash(storage).socketsFor('frost-bloom')).toBe(0);
    storage.failWrite = true;
    const before = stash.socketsFor('cinder-burst');
    expect(stash.craftSkillSocket('cinder-burst')).toBe('storage-error');
    expect(stash.socketsFor('cinder-burst')).toBe(before);
    expect(stash.forgeEmbers).toBe(5);
  });

  it('tracks a tower checkpoint only on a successful, completed-floor extraction', () => {
    const storage = new MemoryStorage();
    const stash = new SecuredStash(storage);
    expect(stash.highestUnlockedDepth).toBe(1);
    expect(stash.secureExpedition([], [], 0, undefined, undefined).ok).toBe(true);
    expect(stash.highestUnlockedDepth).toBe(1); // Early extraction.
    expect(stash.secureExpedition([], [], 0, undefined, 4).ok).toBe(true);
    expect(stash.highestUnlockedDepth).toBe(5);
    expect(new SecuredStash(storage).highestUnlockedDepth).toBe(5);
    expect(stash.secureExpedition([], [], 0, undefined, 2).ok).toBe(true);
    expect(stash.highestUnlockedDepth).toBe(5); // No regression.
    storage.failWrite = true;
    expect(stash.secureExpedition([], [], 0, undefined, 8).ok).toBe(false);
    expect(stash.highestUnlockedDepth).toBe(5);
    storage.failWrite = false;
    expect(stash.secureExpedition([], [], 0, undefined, 0).ok).toBe(false);
    expect(stash.secureExpedition([], [], 0, undefined, 498).ok).toBe(false);
    expect(stash.highestUnlockedDepth).toBe(5);
  });


  it('stores carried and worn items together and loads them across runs', () => {
    const storage = new MemoryStorage();
    const stash = new SecuredStash(storage);
    expect(stash.status).toBe('ready');
    expect(stash.count).toBe(0);
    expect(stash.secureExpedition([item('carried'), item('worn', 'armor')]))
      .toEqual({ ok: true, saved: 2 });
    expect(stash.count).toBe(2);
    expect(stash.completedExpeditions).toBe(1);
    expect(new Set(stash.items.map(value => value.id)).size).toBe(2);
    const reloaded = new SecuredStash(storage);
    expect(reloaded.status).toBe('ready');
    expect(reloaded.items).toEqual(stash.items);
    expect(reloaded.completedExpeditions).toBe(1);
    const next = reloaded.secureExpedition([item('carried'), item('worn', 'armor')]);
    expect(next).toEqual({ ok: true, saved: 2 });
    expect(reloaded.completedExpeditions).toBe(2);
    expect(reloaded.count).toBe(4);
    expect(new Set(reloaded.items.map(value => value.id)).size).toBe(4);
  });

  it('makes new secure IDs when re-running the same exact seed and IDs', () => {
    const storage = new MemoryStorage();
    const vault = new SecuredStash(storage);
    const same = item('item-42-99');
    vault.secureExpedition([same]);
    const priorId = vault.items[0].id;
    vault.secureExpedition([same]);
    expect(vault.items[1].id).not.toBe(priorId);
    expect(vault.items[0].name).toBe(same.name);
    expect(vault.items[1].name).toBe(same.name);
  });

  it('withdraws exactly one secured item with durable remove-before-return', () => {
    const storage = new MemoryStorage();
    const vault = new SecuredStash(storage);
    vault.secureExpedition([item('sword'), item('charm','charm')]);
    const first = vault.items[0];
    const returned = vault.withdraw(first.id)!;
    expect(returned).toEqual(first);
    expect(vault.items.some(owned => owned.id === first.id)).toBe(false);
    expect(vault.count).toBe(1);
    expect(vault.withdraw(first.id)).toBeNull();
    expect(new SecuredStash(storage).count).toBe(1);
    // The returned item is independent from the serialized secured record.
    returned.name = 'Unsecured sword';
    expect(vault.items[0].name).not.toBe(returned.name);
  });

  it('failed storage writes never claim success or remove secured gear', () => {
    const storage = new MemoryStorage();
    const vault = new SecuredStash(storage);
    storage.failWrite = true;
    expect(vault.secureExpedition([item('first')])).toMatchObject({ ok: false, saved: 0 });
    expect(vault.count).toBe(0);
    expect(vault.completedExpeditions).toBe(0);
    storage.failWrite = false;
    vault.secureExpedition([item('first')]);
    const id = vault.items[0].id;
    storage.failWrite = true;
    expect(vault.withdraw(id)).toBeNull();
    expect(vault.count).toBe(1);
    storage.failWrite = false;
    expect(new SecuredStash(storage).items[0].id).toBe(id);
  });

  it('does not overwrite corrupt or unsupported saved data', () => {
    for (const invalid of [
      'not json',
      JSON.stringify({ schema: 99, revision: 0, completed: 0, items: [] }),
      JSON.stringify({ schema: 1, revision: 0, completed: 0, items: [item('a'), item('a')] }),
      JSON.stringify({ schema: 1, revision: 0, completed: 0, items: [{ broken: true }] }),
    ]) {
      const storage = new MemoryStorage();
      storage.values.set(STASH_STORAGE_KEY, invalid);
      const vault = new SecuredStash(storage);
      expect(vault.status).toBe('corrupt');
      expect(vault.secureExpedition([item('safe')])).toMatchObject({
        ok: false, saved: 0, reason: 'storage-corrupt',
      });
      expect(vault.withdraw('any')).toBeNull();
      expect(storage.getItem(STASH_STORAGE_KEY)).toBe(invalid);
    }
  });

  it('does not overwrite a newer save produced by another open tab', () => {
    const storage = new MemoryStorage();
    const first = new SecuredStash(storage);
    const stale = new SecuredStash(storage);
    expect(first.secureExpedition([item('first')])).toMatchObject({ ok: true });
    expect(stale.secureExpedition([item('second')])).toMatchObject({ ok: false, saved: 0 });
    expect(new SecuredStash(storage).items).toHaveLength(1);
    expect(stale.count).toBe(0);
  });

  it('preserves caller ownership and inventory on invalid or duplicated input', () => {
    const storage = new MemoryStorage();
    const stash = new SecuredStash(storage);
    const duplicate = item('dup');
    expect(stash.secureExpedition([duplicate, duplicate])).toMatchObject({
      ok: false, saved: 0, reason: 'invalid-items',
    });
    expect(stash.secureExpedition([{ ...duplicate, itemLevel: 0 }])).toMatchObject({
      ok: false, saved: 0, reason: 'invalid-items',
    });
    expect(stash.count).toBe(0);
    stash.secureExpedition([duplicate]);
    const shown = stash.items[0];
    shown.affixes[0].value = 999;
    expect(stash.items[0].affixes[0].value).toBe(6);
    expect(duplicate.id).toBe('dup');
  });

  it('enforces a fixed stash capacity and leaves stored records untouched when full', () => {
    const storage = new MemoryStorage();
    const stash = new SecuredStash(storage);
    const all = Array.from({ length: STASH_CAPACITY }, (_, i) => item(`g-${i}`));
    expect(stash.secureExpedition(all)).toEqual({ ok: true, saved: STASH_CAPACITY });
    const saved = storage.getItem(STASH_STORAGE_KEY);
    expect(stash.secureExpedition([item('overflow')])).toMatchObject({
      ok: false, saved: 0, reason: 'storage-full',
    });
    expect(storage.getItem(STASH_STORAGE_KEY)).toBe(saved);
    expect(stash.count).toBe(STASH_CAPACITY);
  });

  it('handles blocked reads and unavailable browser storage without crashing', () => {
    const blocked = new MemoryStorage();
    blocked.failRead = true;
    expect(new SecuredStash(blocked).status).toBe('unavailable');
    const unavailable = new SecuredStash(null);
    expect(unavailable.status).toBe('unavailable');
    expect(unavailable.secureExpedition([item('a')])).toMatchObject({
      ok: false, saved: 0, reason: 'storage-unavailable',
    });
  });
});
