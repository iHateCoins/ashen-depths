import { describe, expect, it } from 'vitest';
import {
  AFFIX_POOLS, AFFIX_NAMES, affixBonuses, affixSummary,
  maximumAffixTier, rollEnemyLoot, type ItemAffix, type LootItem,
} from '../src/game/loot/ExpeditionLoot';
import { itemBonuses } from '../src/game/loot/EquipmentLoadout';
import { SecuredStash, STASH_STORAGE_KEY, type StashStorage } from '../src/game/loot/SecuredStash';

class MemoryStorage implements StashStorage {
  readonly data = new Map<string,string>();
  getItem(key:string): string | null {return this.data.get(key) ?? null;}
  setItem(key:string,value:string):void{this.data.set(key,value);}
}
const item = (affixes: ItemAffix[], id = 'hybrid-1'): LootItem => ({
  id, name: 'Enchanted Iron Cleaver', baseName: 'Iron Cleaver',
  rarity: 'rare', itemLevel: 8, slot: 'weapon', affixes,
});

describe('M06 PR01 hybrid loot affixes and tiers', () => {
  it('exposes distinct legal affix pools by item equipment slot', () => {
    expect(AFFIX_POOLS.weapon).toContain('battlemage');
    expect(AFFIX_POOLS.weapon).toContain('raider');
    expect(AFFIX_POOLS.armor).toContain('bastion');
    expect(AFFIX_POOLS.armor).toContain('spellward');
    expect(AFFIX_POOLS.charm).toContain('battlemage');
    for(const pool of Object.values(AFFIX_POOLS)){
      expect(new Set(pool).size).toBe(pool.length);
      for(const affix of pool) expect(AFFIX_NAMES[affix].length).toBeGreaterThan(3);
    }
  });

  it('each hybrid affix applies both advertised stat contributions', () => {
    expect(affixBonuses({id:'battlemage',label:'Battlemage',value:9}))
      .toEqual({attack:9,spell:5,armor:0,health:0});
    expect(affixBonuses({id:'raider',label:'Raider',value:9}))
      .toEqual({attack:9,spell:0,armor:0,health:5});
    expect(affixBonuses({id:'bastion',label:'Bastion',value:9}))
      .toEqual({attack:0,spell:0,armor:5,health:9});
    expect(affixBonuses({id:'spellward',label:'Spellward',value:9}))
      .toEqual({attack:0,spell:9,armor:5,health:0});
    const double = item([{id:'battlemage',label:AFFIX_NAMES.battlemage,value:9,tier:2}]);
    expect(itemBonuses(double).attack).toBe(4+8+9);
    expect(itemBonuses(double).spell).toBe(5);
    expect(affixSummary(double.affixes[0])).toContain('+9 Attack · +5 Spell');
    expect(affixSummary(double.affixes[0])).toContain('T2');
  });

  it('negative forge curses penalize both components without turning a zero roll into free stats', () => {
    expect(affixBonuses({id:'spellward',label:'Spellward',value:-9}))
      .toEqual({attack:0,spell:-9,armor:-5,health:0});
    expect(affixBonuses({id:'raider',label:'Raider',value:-8}))
      .toEqual({attack:-8,spell:0,armor:0,health:-4});
    expect(affixBonuses({id:'raider',label:'Raider',value:0}))
      .toEqual({attack:0,spell:0,armor:0,health:0});
  });

  it('deterministic loot rolls include hybrids and preserve drop/rarity constraints', () => {
    const found = new Set<string>();
    for(let seed=1;seed<=140;seed++){
      for(let id=1;id<=18;id++){
        const a=rollEnemyLoot(seed,id,'brute',false)!;
        const b=rollEnemyLoot(seed,id,'brute',false)!;
        expect(a).toEqual(b);
        expect(a.affixes.length).toBe(a.rarity==='common'?0:a.rarity==='magic'?1:2);
        expect(new Set(a.affixes.map(f=>f.id)).size).toBe(a.affixes.length);
        for(const affix of a.affixes){
          expect(AFFIX_POOLS[a.slot]).toContain(affix.id);
          expect(affix.tier).toBeLessThanOrEqual(maximumAffixTier(a.itemLevel));
          found.add(affix.id);
        }
      }
    }
    expect(found).toEqual(new Set(Object.keys(AFFIX_NAMES)));
  });

  it('early item levels roll tier 1 while Warden items can roll tier 2', () => {
    expect(maximumAffixTier(2)).toBe(1);
    expect(maximumAffixTier(7)).toBe(1);
    expect(maximumAffixTier(8)).toBe(2);
    expect(maximumAffixTier(17)).toBe(3);
    let tier2 = 0;
    for(let seed=1;seed<=100;seed++){
      const boss=rollEnemyLoot(seed,99,'brute',true)!;
      expect(boss.rarity).toBe('rare');
      expect(boss.itemLevel).toBe(8);
      if(boss.affixes.some(affix=>affix.tier===2))tier2++;
    }
    expect(tier2).toBeGreaterThan(20);
  });

  it('reads legacy saves without tier fields and preserves them through extraction', () => {
    const store=new MemoryStorage();
    const old=item([{id:'sharp',label:'Attack Power',value:7},
      {id:'ember',label:'Ember Potency',value:8}]);
    store.data.set(STASH_STORAGE_KEY, JSON.stringify({
      schema:1,revision:1,completed:1,items:[old],unlocks:[],
    }));
    const stash=new SecuredStash(store);
    expect(stash.status).toBe('ready');
    expect(stash.items[0].affixes[0].tier).toBeUndefined();
    expect(stash.secureExpedition([item([{id:'battlemage',label:AFFIX_NAMES.battlemage,value:11,tier:2}], 'new')]).ok).toBe(true);
    const loaded=new SecuredStash(store);
    expect(loaded.status).toBe('ready');
    expect(loaded.items[0].affixes[0]).toEqual(old.affixes[0]);
    expect(loaded.items[1].affixes[0].tier).toBe(2);
    expect(itemBonuses(loaded.items[1]).spell).toBe(6);
  });

  it('rejects invalid tier data without mutating or overwriting corrupted saves',()=>{
    for(const tier of [0,4,1.5,'2']){
      const store=new MemoryStorage();
      const data=JSON.stringify({
        schema:1,revision:1,completed:1,
        items:[item([{id:'battlemage',label:'Test',value:5,tier: tier as 1|2|3}])],
      });
      store.data.set(STASH_STORAGE_KEY,data);
      const stash=new SecuredStash(store);
      expect(stash.status).toBe('corrupt');
      expect(stash.secureExpedition([]).ok).toBe(false);
      expect(store.getItem(STASH_STORAGE_KEY)).toBe(data);
    }
  });
});
