import { describe, it, expect } from 'vitest';
import { PASSIVE_TREES, PassiveTreeProgress, passiveEffects, isValidPassiveAllocation,
  validAllocationLedger } from '../src/game/character/PassiveTrees';
import { SecuredStash, STASH_STORAGE_KEY, type StashStorage } from '../src/game/loot/SecuredStash';
import { AutoSkillSystem, CINDER_BURST } from '../src/game/combat/AutoSkillSystem';
import { mitigatedHitDamage } from '../src/game/loot/EquipmentLoadout';

class Storage implements StashStorage {
  data=new Map<string,string>(); fail=false;
  getItem(k:string):string|null{return this.data.get(k) ?? null;}
  setItem(k:string,v:string):void{if(this.fail)throw Error('quota');this.data.set(k,v);}
}
const baseline={schema:1,revision:3,completed:2,
  items:[{id:'blade',name:'Old Sword',baseName:'Rustbound Sword',rarity:'magic',
    slot:'weapon',itemLevel:5,affixes:[{id:'sharp',label:'Attack Power',value:4}]}],
  forgeEmbers:3,unlocks:['support:focused-power'],
  passiveMilestones:{vanguard:[2,4,6,8],arcanist:[2,4,6]},
  preferredClass:'vanguard'};

describe('M07 PR04 permanently allocated passive trees',()=>{
  it('defines three coherent four-step branches for both classes',()=>{
    for(const cls of ['vanguard','arcanist'] as const){
      const nodes=PASSIVE_TREES[cls];
      expect(nodes).toHaveLength(12);
      expect(new Set(nodes.map(n=>n.id)).size).toBe(12);
      for(const branch of ['assault','ward','hybrid'] as const){
        const lane=nodes.filter(n=>n.branch===branch);
        expect(lane.map(n=>n.tier)).toEqual([1,2,3,4]);
        expect(lane[0].requires).toEqual([]);
        for(let i=1;i<lane.length;i++)
          expect(lane[i].requires).toEqual([lane[i-1].id]);
      }
    }
  });

  it('charges exactly one banked point per node and gates advanced tiers',()=>{
    const p=new PassiveTreeProgress('vanguard',[],3);
    expect(p.tryAllocate('v-edge')).toBe('prerequisite');
    expect(p.tryAllocate('not-a-node')).toBe('unknown');
    expect(p.tryAllocate('v-strike')).toBe('allocated');
    expect(p.tryAllocate('v-strike')).toBe('already-allocated');
    expect(p.tryAllocate('v-tempo')).toBe('allocated');
    expect(p.tryAllocate('v-edge')).toBe('allocated');
    expect(p.tryAllocate('v-execution')).toBe('no-points');
    expect(p.available).toBe(0);
    expect(p.spent).toBe(3);
    expect(p.effects.attack).toBe(10);
    expect(p.effects.cooldownReduction).toBe(3);
    expect(p.allocations).toEqual(['v-strike','v-tempo','v-edge']);
    const leaked=p.allocations as string[];leaked.push('v-execution');
    expect(p.allocations).toHaveLength(3);
  });

  it('preserves old saves and only applies paid passives, never at-risk milestones',()=>{
    const storage=new Storage();
    storage.setItem(STASH_STORAGE_KEY,JSON.stringify(baseline));
    const save=new SecuredStash(storage);
    expect(save.status).toBe('ready');
    expect(save.allocationsFor('vanguard')).toEqual([]);
    expect(save.passivePointsFor('vanguard')).toBe(4);
    expect(save.allocatePassiveNode('vanguard','v-edge')).toBe('prerequisite');
    expect(save.allocatePassiveNode('vanguard','v-strike')).toBe('allocated');
    expect(save.allocatePassiveNode('vanguard','v-tempo')).toBe('allocated');
    expect(save.allocatePassiveNode('vanguard','v-edge')).toBe('allocated');
    expect(save.allocatePassiveNode('vanguard','v-execution')).toBe('allocated');
    expect(save.allocatePassiveNode('vanguard','v-fortitude')).toBe('no-points');
    expect(save.allocatePassiveNode('arcanist','a-spark')).toBe('allocated');
    const reloaded=new SecuredStash(storage);
    expect(reloaded.allocationsFor('vanguard')).toEqual([
      'v-strike','v-tempo','v-edge','v-execution']);
    expect(reloaded.allocationsFor('arcanist')).toEqual(['a-spark']);
    expect(reloaded.passivePointsFor('vanguard')).toBe(4);
    expect(reloaded.forgeEmbers).toBe(3);
    expect(reloaded.unlockedIds).toEqual(['support:focused-power']);
    expect(reloaded.items[0].id).toBe('blade');
    const leaked=reloaded.passiveAllocations;
    leaked.vanguard!.pop();
    expect(reloaded.allocationsFor('vanguard')).toHaveLength(4);
    // New Warden reward may increase available balance, but never grants
    // an allocation or retroactively spends it.
    expect(reloaded.secureExpedition([],[],2,{classId:'vanguard',depths:[10]}).ok).toBe(true);
    const after=new SecuredStash(storage);
    expect(after.passivePointsFor('vanguard')).toBe(5);
    expect(after.allocationsFor('vanguard')).toHaveLength(4);
    expect(after.forgeEmbers).toBe(5);
  });

  it('rejects foreign nodes, duplicates, skipped prerequisites and overspending',()=>{
    expect(isValidPassiveAllocation('vanguard',['v-strike','v-edge'],3)).toBe(false);
    expect(isValidPassiveAllocation('vanguard',['v-tempo','v-strike'],3)).toBe(false);
    expect(isValidPassiveAllocation('vanguard',['a-spark'],3)).toBe(false);
    expect(isValidPassiveAllocation('vanguard',['v-strike','v-strike'],3)).toBe(false);
    expect(isValidPassiveAllocation('vanguard',['v-strike','v-tempo'],1)).toBe(false);
    expect(isValidPassiveAllocation('vanguard',['v-fortitude','v-strike'],2)).toBe(true);
    expect(validAllocationLedger({vanguard:['v-strike']},{vanguard:[2]})).toBe(true);
    expect(validAllocationLedger({vanguard:['v-strike'],rogue:[]},{vanguard:[2]})).toBe(false);
    expect(validAllocationLedger({vanguard:['v-strike','v-tempo']},{vanguard:[2]})).toBe(false);
    for(const allocations of [
      {vanguard:['v-edge']}, {vanguard:['a-spark']}, {vanguard:['v-strike','v-strike']},
      {vanguard:['v-strike','v-tempo','v-edge','v-execution','v-fortitude']},
      {ghost:[]}, [],
    ]){
      const storage=new Storage();
      const serialized=JSON.stringify({...baseline,passiveAllocations:allocations});
      storage.setItem(STASH_STORAGE_KEY,serialized);
      const stash=new SecuredStash(storage);
      expect(stash.status).toBe('corrupt');
      expect(stash.allocatePassiveNode('vanguard','v-strike')).toBe('storage-error');
      expect(storage.getItem(STASH_STORAGE_KEY)).toBe(serialized);
    }
  });

  it('does not consume a point on failed storage writes or stale tabs',()=>{
    const storage=new Storage();
    storage.setItem(STASH_STORAGE_KEY,JSON.stringify(baseline));
    const first=new SecuredStash(storage),stale=new SecuredStash(storage);
    const raw=storage.getItem(STASH_STORAGE_KEY);
    storage.fail=true;
    expect(first.allocatePassiveNode('vanguard','v-strike')).toBe('storage-error');
    expect(first.allocationsFor('vanguard')).toEqual([]);
    expect(storage.getItem(STASH_STORAGE_KEY)).toBe(raw);
    storage.fail=false;
    expect(first.allocatePassiveNode('vanguard','v-strike')).toBe('allocated');
    expect(stale.allocatePassiveNode('vanguard','v-fortitude')).toBe('storage-error');
    expect(new SecuredStash(storage).allocationsFor('vanguard')).toEqual(['v-strike']);
    expect(new SecuredStash(null).allocatePassiveNode('vanguard','v-strike')).toBe('storage-error');
  });

  it('carries bonuses into real damage, mitigation, maximum health and auto-cast cooldowns',()=>{
    const v=passiveEffects('vanguard',['v-strike','v-tempo','v-fortitude','v-plating']);
    expect(v).toMatchObject({attack:5,armor:2,health:6,cooldownReduction:3});
    expect(mitigatedHitDamage(20,v.armor)).toBe(18);
    const spell=new AutoSkillSystem([CINDER_BURST]);
    const baselineCooldown=spell.effectiveStats('cinder-burst').cooldownSeconds;
    spell.passiveCooldownReduction=v.cooldownReduction;
    expect(spell.effectiveStats('cinder-burst').cooldownSeconds).toBeLessThan(baselineCooldown);
    const other=passiveEffects('arcanist',['a-spark','a-focus']);
    expect(other.spell).toBe(5);
    expect(other.cooldownReduction).toBe(3);
  });

  it('separate class trees persist without resetting each other after selection or extraction',()=>{
    const storage=new Storage();
    storage.setItem(STASH_STORAGE_KEY,JSON.stringify(baseline));
    const stash=new SecuredStash(storage);
    expect(stash.allocatePassiveNode('vanguard','v-fortitude')).toBe('allocated');
    expect(stash.selectCharacterClass('arcanist')).toBe(true);
    expect(stash.allocatePassiveNode('arcanist','a-spark')).toBe('allocated');
    expect(stash.secureExpedition([],[],0,{classId:'arcanist',depths:[8]}).ok).toBe(true);
    const next=new SecuredStash(storage);
    expect(next.passiveAllocations).toEqual({vanguard:['v-fortitude'],arcanist:['a-spark']});
    expect(next.passivePointsFor('arcanist')).toBe(4);
    expect(next.passivePointsFor('vanguard')).toBe(4);
  });
});
