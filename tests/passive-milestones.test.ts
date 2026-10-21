import { describe, expect, it } from 'vitest';
import { PassiveMilestoneProgress, validPassiveDepth, validPassiveLedger } from '../src/game/character/PassiveMilestones';
import { SecuredStash, STASH_STORAGE_KEY, type StashStorage } from '../src/game/loot/SecuredStash';

class Storage implements StashStorage {
  private readonly data = new Map<string,string>();
  fail = false;
  getItem(key:string):string|null {return this.data.get(key) ?? null;}
  setItem(key:string,value:string):void {
    if(this.fail) throw Error('quota exceeded');
    this.data.set(key,value);
  }
}
const attach=(storage:Storage,data:unknown)=>storage.setItem(STASH_STORAGE_KEY,JSON.stringify(data));

describe('M07 PR03 Warden-gated passive point progression',()=>{
  it('requires a completed even Warden kill; rejects entering, odd depths and repeats',()=>{
    const p=new PassiveMilestoneProgress('vanguard');
    expect(p.defeatWarden(1,true)).toBe(false);
    expect(p.defeatWarden(2,false)).toBe(false);
    expect(p.defeatWarden(2,true)).toBe(true);
    expect(p.defeatWarden(2,true)).toBe(false);
    expect(p.defeatWarden(3,true)).toBe(false);
    expect(p.defeatWarden(4,false)).toBe(false);
    expect(p.defeatWarden(4,true)).toBe(true);
    expect(p.defeatWarden(6,true)).toBe(true);
    expect(p.pendingDepths).toEqual([2,4,6]);
    expect(p.bankedPoints).toBe(0);
    expect(p.pendingPoints).toBe(3);
    expect(p.defeatWarden(498,true)).toBe(false);
    expect(validPassiveDepth(496)).toBe(true);
    expect(validPassiveDepth(497)).toBe(false);
  });

  it('secures every milestone exactly once with the existing stash in one write',()=>{
    const storage=new Storage();
    const stash=new SecuredStash(storage);
    const run=new PassiveMilestoneProgress('vanguard',stash.passiveDepthsFor('vanguard'));
    expect(run.defeatWarden(2,true)).toBe(true);
    expect(run.defeatWarden(4,true)).toBe(true);
    expect(stash.passivePointsFor('vanguard')).toBe(0); // not a Warden autosave
    expect(storage.getItem(STASH_STORAGE_KEY)).toBeNull();
    expect(stash.secureExpedition([],[],2,
      {classId:'vanguard',depths:run.pendingDepths})).toMatchObject({ok:true,saved:0});
    const saved=JSON.parse(storage.getItem(STASH_STORAGE_KEY)!);
    expect(saved.passiveMilestones).toEqual({vanguard:[2,4]});
    expect(saved.forgeEmbers).toBe(2);
    expect(saved.completed).toBe(1);
    const second=new SecuredStash(storage);
    expect(second.passivePointsFor('vanguard')).toBe(2);
    expect(second.passivePointsFor('arcanist')).toBe(0);
    expect(second.passiveDepthsFor('vanguard')).toEqual([2,4]);
    const replay=new PassiveMilestoneProgress('vanguard',second.passiveDepthsFor('vanguard'));
    expect(replay.defeatWarden(2,true)).toBe(false);
    expect(replay.defeatWarden(4,true)).toBe(false);
    expect(replay.defeatWarden(6,true)).toBe(true);
    expect(second.secureExpedition([],[],0,
      {classId:'vanguard',depths:replay.pendingDepths})).toMatchObject({ok:true});
    expect(new SecuredStash(storage).passiveDepthsFor('vanguard')).toEqual([2,4,6]);
    expect(second.secureExpedition([],[],0,{classId:'vanguard',depths:[2]}).ok).toBe(false);
  });

  it('keeps a permanent class while preserving independent legacy passive ledgers',()=>{
    const storage=new Storage();
    const first=new SecuredStash(storage);
    expect(first.selectCharacterClass('vanguard')).toBe(true);
    expect(first.secureExpedition([],[],0,{classId:'vanguard',depths:[2,4]}).ok).toBe(true);
    const active=new SecuredStash(storage);
    const p=new PassiveMilestoneProgress('vanguard',active.passiveDepthsFor('vanguard'));
    expect(p.bankedPoints).toBe(2);
    expect(active.selectCharacterClass('arcanist')).toBe(false);
    expect(p.selectClass('arcanist',active.passiveDepthsFor('arcanist'))).toBe(true);
    expect(p.bankedPoints).toBe(0);
    expect(p.defeatWarden(2,true)).toBe(true);
    expect(p.selectClass('vanguard',active.passiveDepthsFor('vanguard'))).toBe(false);
    expect(active.secureExpedition([],[],0,{classId:'arcanist',depths:p.pendingDepths}).ok).toBe(true);
    const save=new SecuredStash(storage);
    expect(save.passiveMilestones).toEqual({vanguard:[2,4],arcanist:[2]});
    expect(save.passivePointsFor('vanguard')).toBe(2);
    expect(save.passivePointsFor('arcanist')).toBe(1);
    const clone=save.passiveMilestones;
    clone.vanguard!.push(6);
    expect(save.passiveDepthsFor('vanguard')).toEqual([2,4]);
  });

  it('keeps the entire save unchanged on failed or stale write, including Embers and gear',()=>{
    const storage=new Storage();
    const original={
      schema:1,revision:4,completed:3,preferredClass:'arcanist',
      forgeEmbers:12,unlocks:['skill:frost-bloom'],
      items:[{id:'kept-sword',name:'Old Sword',baseName:'Rustbound Sword',
        rarity:'magic',slot:'weapon',itemLevel:5,
        affixes:[{id:'sharp',label:'Attack Power',value:8}]}],
    };
    attach(storage,original);
    const stash=new SecuredStash(storage);
    const stale=new SecuredStash(storage);
    const before=storage.getItem(STASH_STORAGE_KEY)!;
    storage.fail=true;
    expect(stash.secureExpedition([],[],0,{classId:'arcanist',depths:[2]}).ok).toBe(false);
    expect(storage.getItem(STASH_STORAGE_KEY)).toBe(before);
    expect(stash.passivePointsFor('arcanist')).toBe(0);
    storage.fail=false;
    expect(stash.secureExpedition([],[],0,{classId:'arcanist',depths:[2]}).ok).toBe(true);
    expect(stale.secureExpedition([],[],0,{classId:'arcanist',depths:[4]}).ok).toBe(false);
    const saved=new SecuredStash(storage);
    expect(saved.passiveDepthsFor('arcanist')).toEqual([2]);
    expect(saved.forgeEmbers).toBe(12);
    expect(saved.unlockedIds).toEqual(['skill:frost-bloom']);
    expect(saved.items[0].id).toBe('kept-sword');
  });

  it('rejects malformed, duplicate and unreachable ledger entries without overwriting bytes',()=>{
    const cases=[
      {vanguard:[2,2]}, {arcanist:[4,2]}, {arcanist:[1]},
      {vanguard:[498]}, {vanguard:[2.5]}, {arcanist:4},
      {warrior:[2]}, Object.fromEntries([['__proto__',[2]]]), [],
    ];
    for (const ledger of cases) {
      if (ledger && Object.keys(ledger).length === 0 && !Array.isArray(ledger)) continue;
      expect(validPassiveLedger(ledger)).toBe(false);
      const storage=new Storage();
      const raw=JSON.stringify({schema:1,revision:2,completed:1,items:[],
        passiveMilestones:ledger});
      storage.setItem(STASH_STORAGE_KEY,raw);
      const broken=new SecuredStash(storage);
      expect(broken.status).toBe('corrupt');
      expect(broken.secureExpedition([],[],0,{classId:'vanguard',depths:[2]}).ok).toBe(false);
      expect(storage.getItem(STASH_STORAGE_KEY)).toBe(raw);
    }
    const storage=new Storage();
    const stash=new SecuredStash(storage);
    for(const depths of [[2,2],[3],[0],[498],[2,4,4]]) {
      expect(stash.secureExpedition([],[],0,{classId:'vanguard',depths}).ok).toBe(false);
    }
    expect(storage.getItem(STASH_STORAGE_KEY)).toBeNull();
  });

  it('loads all pre-M07 saves unchanged, with zero passive points by default',()=>{
    const storage=new Storage();
    const old={schema:1,revision:12,completed:9,items:[],forgeEmbers:2,
      preferredClass:'vanguard',unlocks:['support:focused-power']};
    attach(storage,old);
    const stash=new SecuredStash(storage);
    expect(stash.status).toBe('ready');
    expect(stash.passiveMilestones).toEqual({});
    expect(stash.passivePointsFor('vanguard')).toBe(0);
    expect(stash.passivePointsFor('arcanist')).toBe(0);
    expect(stash.secureExpedition([],[],0).ok).toBe(true);
    const saved=new SecuredStash(storage);
    expect(saved.passiveMilestones).toEqual({});
    expect(saved.preferredClass).toBe('vanguard');
    expect(saved.unlockedIds).toEqual(['support:focused-power']);
  });
});
