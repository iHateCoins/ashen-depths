import { describe, expect, it } from 'vitest';
import {
  ITEM_BASES, itemBaseStats, legacyBaseStats, rollBaseStats, rollEnemyLoot,
  type EquipmentSlot, type LootItem,
} from '../src/game/loot/ExpeditionLoot';
import { baseBonusSummary, itemBonuses } from '../src/game/loot/EquipmentLoadout';
import { SecuredStash, STASH_STORAGE_KEY, type StashStorage } from '../src/game/loot/SecuredStash';

class Storage implements StashStorage {
  private readonly data = new Map<string,string>();
  getItem(key:string): string | null {return this.data.get(key) ?? null;}
  setItem(key:string, value:string): void {this.data.set(key,value);}
}

const legacy: LootItem = {
  id:'old-staff',name:'Enchanted Ashwood Staff',baseName:'Ashwood Staff',
  rarity:'magic',slot:'weapon',itemLevel:5,
  affixes:[{id:'ember',label:'Ember Potency',value:7}],
};

describe('M06 PR02 meaningful base families', () => {
  it('every slot has starter and level-gated advanced bases with unique names', () => {
    for(const slot of ['weapon','armor','charm'] as EquipmentSlot[]) {
      const choices=ITEM_BASES[slot];
      expect(choices).toHaveLength(6);
      expect(new Set(choices.map(base=>base.name)).size).toBe(choices.length);
      expect(choices.filter(base=>base.minLevel===1)).toHaveLength(4);
      expect(choices.filter(base=>base.minLevel===8)).toHaveLength(2);
    }
  });

  it('base type itself changes real Attack/Spell/Armor/Health at identical level', () => {
    const staff=rollBaseStats('weapon',5,ITEM_BASES.weapon[2]);
    const cleaver=rollBaseStats('weapon',5,ITEM_BASES.weapon[1]);
    const mantle=rollBaseStats('armor',5,ITEM_BASES.armor[2]);
    const ironmail=rollBaseStats('armor',5,ITEM_BASES.armor[1]);
    const bone=rollBaseStats('charm',5,ITEM_BASES.charm[1]);
    const ember=rollBaseStats('charm',5,ITEM_BASES.charm[0]);
    expect(staff.spell).toBe(5);
    expect(staff.attack).toBeLessThan(cleaver.attack);
    expect(mantle.spell).toBe(4);
    expect(mantle.armor).toBeLessThan(ironmail.armor);
    expect(bone.health).toBe(6);
    expect(bone.spell).toBeLessThan(ember.spell);
    const staffItem:LootItem={...legacy,baseStats:staff};
    expect(itemBonuses(staffItem)).toMatchObject({
      attack:staff.attack,spell:12,armor:0,health:0,
    });
    expect(baseBonusSummary(staffItem)).toContain('+5 Spell');
  });

  it('seeded drops are deterministic, legal by level and include all starter and advanced families', () => {
    const starter=new Set<string>();
    const advanced=new Set<string>();
    for(let seed=1;seed<=170;seed++){
      for(let id=1;id<=15;id++){
        const first=rollEnemyLoot(seed,id,'brute',false)!;
        expect(first).toEqual(rollEnemyLoot(seed,id,'brute',false)!);
        const def=ITEM_BASES[first.slot].find(base=>base.name===first.baseName)!;
        expect(def).toBeDefined();
        expect(def.minLevel).toBeLessThanOrEqual(first.itemLevel);
        expect(first.itemLevel).toBe(5);
        expect(first.baseStats).toEqual(rollBaseStats(first.slot,5,def));
        starter.add(first.baseName);
      }
      const boss=rollEnemyLoot(seed,99,'brute',true)!;
      expect(boss.rarity).toBe('rare');
      expect(boss.itemLevel).toBe(8);
      const def=ITEM_BASES[boss.slot].find(base=>base.name===boss.baseName)!;
      expect(def).toBeDefined();
      expect(boss.baseStats).toEqual(rollBaseStats(boss.slot,8,def));
      if(def.minLevel===8) advanced.add(boss.baseName);
    }
    expect(starter.size).toBe(12);
    expect(advanced.size).toBeGreaterThanOrEqual(4);
    expect([...starter].every(base=>![...ITEM_BASES.weapon,...ITEM_BASES.armor,
      ...ITEM_BASES.charm].some(def=>def.name===base && def.minLevel>=8))).toBe(true);
  });

  it('legacy items preserve their exact original slot-and-level bonuses', () => {
    expect(legacy.baseStats).toBeUndefined();
    expect(itemBaseStats(legacy)).toEqual(legacyBaseStats('weapon',5));
    expect(itemBonuses(legacy)).toEqual({attack:9,spell:7,armor:0,health:0});
    expect(baseBonusSummary(legacy)).toBe('Base · +9 Attack');
    // Reading base data returns a value object, never a writable stash reference.
    const stats=itemBaseStats(legacy);
    stats.attack=999;
    expect(itemBaseStats(legacy).attack).toBe(9);
  });

  it('extraction and reload preserve snapshots, without changing old gear',()=>{
    const storage=new Storage();
    const original=rollEnemyLoot(42,990,'brute',true)!;
    const stash=new SecuredStash(storage);
    expect(stash.secureExpedition([legacy,original],[],1)).toMatchObject({ok:true,saved:2});
    const reloaded=new SecuredStash(storage);
    expect(reloaded.status).toBe('ready');
    expect(reloaded.items[0].baseStats).toBeUndefined();
    expect(itemBonuses(reloaded.items[0])).toEqual({attack:9,spell:7,armor:0,health:0});
    expect(reloaded.items[1].baseStats).toEqual(original.baseStats);
    // Never expose the persisted base stats through a mutable getter reference.
    const returned=reloaded.items[1];
    returned.baseStats!.attack=9999;
    expect(reloaded.items[1].baseStats).toEqual(original.baseStats);
    const later=new SecuredStash(storage);
    const id=later.items[1].id;
    expect(later.reforgeItem(id,0)).toBe(true);
    const forged=later.items[1];
    expect(forged.forged).toBe(true);
    expect(forged.baseStats).toEqual(original.baseStats);
    expect(new SecuredStash(storage).items[1].baseStats).toEqual(original.baseStats);
  });

  it('rejects corrupt or unsafe base snapshots without overwriting storage',()=>{
    for(const bad of [
      {attack:3,spell:NaN,armor:1,health:0},
      {attack:-1,spell:0,armor:1,health:0},
      {attack:1.5,spell:0,armor:1,health:0},
      {attack:1,spell:0,armor:1},
      {attack:10001,spell:0,armor:1,health:0},
    ]){
      const storage=new Storage();
      const invalid={...legacy,baseStats:bad};
      const raw=JSON.stringify({
        schema:1,revision:2,completed:2,items:[invalid],unlocks:[],forgeEmbers:0,
      });
      storage.setItem(STASH_STORAGE_KEY,raw);
      const stash=new SecuredStash(storage);
      expect(stash.status).toBe('corrupt');
      expect(stash.secureExpedition([]).ok).toBe(false);
      expect(storage.getItem(STASH_STORAGE_KEY)).toBe(raw);
    }
  });
});
