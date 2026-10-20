import {describe,it,expect} from 'vitest';
import {createDungeonNavigationGrid,generateDungeon} from '../src/game/dungeon/DungeonGenerator';
import {planRoomEncounters,RoomEncounterDirector} from '../src/game/combat/RoomEncounterDirector';
import {WARDEN_VARIANTS,wardenForDepth,eliteCombatProfile} from '../src/game/combat/DepthEncounters';
import {ENEMY_ARCHETYPES,createEnemyAgent,updateEnemyAgents} from '../src/game/combat/EnemyAI';
import {NavigationGrid} from '../src/game/navigation/Grid';
import {rollEnemyLoot,maximumAffixTier} from '../src/game/loot/ExpeditionLoot';
import {seedForDepth} from '../src/game/dungeon/DepthProgression';

describe('M07 PR05 — deeper enemies, bosses and escalating loot',()=>{
  it('retains exact original Depth 1 enemies and base Warden behavior',()=>{
    const layout=generateDungeon(42);
    const grid=createDungeonNavigationGrid(layout);
    const original=planRoomEncounters(layout,grid);
    const one=planRoomEncounters(layout,grid,1);
    expect(one).toEqual(original);
    expect(one.some(x=>x.elite || x.kind==='skirmisher' || x.wardenVariant)).toBe(false);
    const boss=one.find(x=>x.guardian)!;
    expect(boss.kind).toBe('brute');
    expect(boss.maxHp).toBe(300);
    expect(wardenForDepth(1)).toBe('warden');
    expect(WARDEN_VARIANTS.warden.profile).toEqual(ENEMY_ARCHETYPES.brute);
    expect(rollEnemyLoot(42,77,'brute',false,1))
      .toEqual(rollEnemyLoot(42,77,'brute',false));
  });

  it('alternates fast and wide-slam Wardens beyond Depth 1, with marked radii',()=>{
    expect(wardenForDepth(2)).toBe('ash-reaver');
    expect(wardenForDepth(3)).toBe('stone-sentinel');
    expect(wardenForDepth(4)).toBe('ash-reaver');
    for(const invalid of [0,-1,1.2,498,Infinity])
      expect(()=>wardenForDepth(invalid)).toThrow();
    const fast=WARDEN_VARIANTS['ash-reaver'].profile;
    const slow=WARDEN_VARIANTS['stone-sentinel'].profile;
    expect(fast.speed).toBeGreaterThan(ENEMY_ARCHETYPES.brute.speed);
    expect(fast.windupSeconds).toBeLessThan(ENEMY_ARCHETYPES.brute.windupSeconds);
    expect(fast.attackRadius).toBeLessThan(ENEMY_ARCHETYPES.brute.attackRadius);
    expect(slow.attackRadius).toBeGreaterThan(ENEMY_ARCHETYPES.brute.attackRadius);
    expect(slow.windupSeconds).toBeGreaterThan(ENEMY_ARCHETYPES.brute.windupSeconds);
    const grid=new NavigationGrid(640,640,32);
    const attacker=createEnemyAgent({id:3,position:{x:80,y:80},hp:500,maxHp:500},'brute',fast);
    updateEnemyAgents([attacker],{x:110,y:80},grid,0.05);
    expect(attacker.phase).toBe('windup');
    expect(attacker.phaseRemaining).toBe(fast.windupSeconds);
    const strikes=[];
    for(let i=0;i<20;i++)strikes.push(...updateEnemyAgents([attacker],{x:110,y:80},grid,0.05));
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toMatchObject({radius:fast.attackRadius,damage:fast.attackDamage,hit:true});
    const dodger=createEnemyAgent({id:4,position:{x:80,y:80},hp:500,maxHp:500},'brute',slow);
    updateEnemyAgents([dodger],{x:100,y:80},grid,0.05);
    let hit=false;
    for(let i=0;i<29;i++) for(const strike of updateEnemyAgents([dodger],{x:350,y:80},grid,0.05))
      hit ||= strike.hit;
    expect(hit).toBe(false);
  });

  it('adds seeded elites and skirmishers only on deeper floors and keeps spawns navigable',()=>{
    let seenElites=0,seenSkirmishers=0;
    for(let seed=1;seed<=20;seed++){
      const layout=generateDungeon(seedForDepth(seed,3));
      const grid=createDungeonNavigationGrid(layout);
      const first=planRoomEncounters(layout,grid,3);
      expect(first).toEqual(planRoomEncounters(layout,grid,3));
      const director=new RoomEncounterDirector(layout,grid,3);
      expect(director.placements).toEqual(first);
      expect(first.filter(x=>x.guardian)).toHaveLength(1);
      expect(first.find(x=>x.guardian)!.wardenVariant).toBe('stone-sentinel');
      seenElites+=first.filter(x=>x.elite).length;
      seenSkirmishers+=first.filter(x=>x.kind==='skirmisher').length;
      for(const placement of first){
        expect(grid.isWalkable(grid.cellAt(placement.position))).toBe(true);
        if(placement.elite){
          expect(placement.guardian).toBe(false);
          const stats=eliteCombatProfile(placement.kind);
          expect(stats.attackDamage).toBeGreaterThan(ENEMY_ARCHETYPES[placement.kind].attackDamage);
        }
      }
    }
    expect(seenElites).toBeGreaterThan(0);
    expect(seenSkirmishers).toBeGreaterThan(0);
    expect(ENEMY_ARCHETYPES.skirmisher.speed).toBeGreaterThan(ENEMY_ARCHETYPES.wretch.speed);
    expect(ENEMY_ARCHETYPES.skirmisher.windupSeconds).toBeLessThan(ENEMY_ARCHETYPES.wretch.windupSeconds);
  });

  it('makes elites worth the risk, improves later rare odds and retains deterministic items',()=>{
    let improved=0;
    for(let id=1;id<=500;id++){
      const seed=123;
      const deep=rollEnemyLoot(seed,id,'brute',false,5)!;
      const normal=rollEnemyLoot(seed,id,'brute',false,1)!;
      if(deep.rarity==='rare' && normal.rarity!=='rare') improved++;
      const elite=rollEnemyLoot(seed,id,'skirmisher',false,5,true)!;
      expect(elite).not.toBeNull();
      expect(['magic','rare']).toContain(elite.rarity);
      expect(elite.itemLevel).toBeGreaterThanOrEqual(11);
      expect(elite).toEqual(rollEnemyLoot(seed,id,'skirmisher',false,5,true));
      expect(elite.affixes.every(affix=>affix.tier!<=maximumAffixTier(elite.itemLevel))).toBe(true);
    }
    expect(improved).toBeGreaterThan(0);
    const boss=rollEnemyLoot(seedForDepth(42,3),99,'brute',true,3)!;
    expect(boss.rarity).toBe('rare');
    expect(boss.itemLevel).toBe(12);
    expect(boss.affixes).toHaveLength(2);
    const old=rollEnemyLoot(42,15,'wretch',false);
    expect(old).toEqual(rollEnemyLoot(42,15,'wretch',false,1,false));
  });
});
