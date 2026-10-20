import { describe, expect, it } from 'vitest';
import { canDescend, isPassiveMilestone, seedForDepth } from '../src/game/dungeon/DepthProgression';
import { ExpeditionLoot, rollEnemyLoot } from '../src/game/loot/ExpeditionLoot';
import { rewardSourceAtDepth, SkillProgression } from '../src/game/combat/SkillProgression';

describe('M07 depth foundation', () => {
  it('starts with the existing seed, then creates distinct reproducible floors', () => {
    expect(seedForDepth(42,1)).toBe(42);
    const depths=Array.from({length:20},(_,i)=>seedForDepth(42,i+1));
    expect(new Set(depths).size).toBe(depths.length);
    expect(seedForDepth(42,2)).toBe(seedForDepth(42,2));
    expect(seedForDepth(43,2)).not.toBe(depths[1]);
    for(const invalid of [0,-1,1.5,498,Infinity,NaN]){
      expect(()=>seedForDepth(42,invalid)).toThrow();
    }
  });
  it('requires a live player and defeated Warden to descend', () => {
    expect(canDescend(1,false,false)).toBe(false);
    expect(canDescend(1,true,true)).toBe(false);
    expect(canDescend(1,true,false)).toBe(true);
    expect(canDescend(2,true,false)).toBe(true);
    expect(canDescend(497,true,false)).toBe(false);
    expect(canDescend(0,true,false)).toBe(false);
    expect(isPassiveMilestone(2,false)).toBe(false);
    expect(isPassiveMilestone(2,true)).toBe(true);
    expect(isPassiveMilestone(3,true)).toBe(false);
    expect(isPassiveMilestone(4,true)).toBe(true);
    // Point currency and extraction persistence are deliberately added in PR02.
  });
  it('offers a distinct cache and Warden choice on every depth within one risky expedition', () => {
    const p=new SkillProgression();
    expect(p.offer(rewardSourceAtDepth('warden',1))).toBe(true);
    expect(p.choose('warden','forge:ember')).toBe(true);
    expect(p.offer(rewardSourceAtDepth('cache',1))).toBe(true);
    expect(p.offer(rewardSourceAtDepth('warden',2))).toBe(true);
    expect(p.offer(rewardSourceAtDepth('cache',2))).toBe(true);
    expect(p.choicesRemaining).toEqual(['cache','warden:2','cache:2']);
    expect(p.choose('warden:2','forge:ember')).toBe(true);
    expect(p.pendingForgeEmbers).toBe(2);
    expect(p.choose('warden:2','forge:ember')).toBe(false);
    expect(p.choose('cache:2','skill:frost-bloom')).toBe(true);
    expect(p.pendingUnlocks).toEqual(['skill:frost-bloom']);
    expect(p.choicesRemaining).toEqual(['cache']);
  });
  it('deeper seeded drops unlock improved item levels without touching depth 1', () => {
    const bossOne=rollEnemyLoot(42,99,'brute',true);
    const bossTwo=rollEnemyLoot(seedForDepth(42,2),99,'brute',true,2);
    const bossFive=rollEnemyLoot(seedForDepth(42,5),99,'brute',true,5);
    expect(bossOne?.itemLevel).toBe(8);
    expect(bossTwo?.itemLevel).toBe(10);
    expect(bossFive?.itemLevel).toBe(16);
    expect(new ExpeditionLoot(seedForDepth(42,2),24,2)
      .dropForEnemy(99,'brute',true,{x:0,y:0})?.item.itemLevel).toBe(10);
    expect(bossTwo?.id).not.toBe(bossOne?.id);
    expect(() => new ExpeditionLoot(42,24,498)).toThrow();
  });
});
