import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES, DEFAULT_CHARACTER_CLASS, isCharacterClassId } from '../src/game/character/CharacterClasses';
import { SkillProgression } from '../src/game/combat/SkillProgression';
import { AutoCombat } from '../src/game/combat/AutoCombat';
import { AutoSkillSystem } from '../src/game/combat/AutoSkillSystem';
import { SecuredStash, STASH_STORAGE_KEY, type StashStorage } from '../src/game/loot/SecuredStash';

class Storage implements StashStorage {
  readonly values = new Map<string, string>();
  fail = false;
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (this.fail) throw new Error('blocked');
    this.values.set(key, value);
  }
}

describe('M07 PR02 class foundations', () => {
  it('defines two distinct real combat starting points', () => {
    expect(DEFAULT_CHARACTER_CLASS).toBe('arcanist');
    expect(Object.keys(CHARACTER_CLASSES).sort()).toEqual(['arcanist', 'vanguard']);
    for (const cls of Object.values(CHARACTER_CLASSES)) {
      const combat = new AutoCombat(cls.basicRange, cls.basicDamage, cls.basicInterval);
      const active = new AutoSkillSystem([cls.startingSkill]);
      expect(combat.range).toBe(cls.basicRange);
      expect(combat.damage).toBe(cls.basicDamage);
      expect(active.equipped.map(skill => skill.id)).toEqual([cls.startingSkill.id]);
    }
    expect(CHARACTER_CLASSES.vanguard.health).toBeGreaterThan(CHARACTER_CLASSES.arcanist.health);
    expect(CHARACTER_CLASSES.vanguard.basicRange).toBeLessThan(CHARACTER_CLASSES.arcanist.basicRange);
    expect(CHARACTER_CLASSES.vanguard.startingSkill.type).toBe('attack');
    expect(CHARACTER_CLASSES.arcanist.startingSkill.type).toBe('spell');
    expect(isCharacterClassId('vanguard')).toBe(true);
    expect(isCharacterClassId('arcanist')).toBe(true);
    expect(isCharacterClassId('warrior')).toBe(false);
  });

  it('each class starts with one active skill and can learn the opposite archetype', () => {
    const mage = new SkillProgression([], 'arcanist');
    expect(mage.canUseSkill('cinder-burst')).toBe(true);
    expect(mage.canUseSkill('crescent-cleave')).toBe(false);
    expect(mage.availableChoices.map(choice => choice.id)).not.toContain('skill:cinder-burst');
    expect(mage.availableChoices.map(choice => choice.id)).toContain('skill:crescent-cleave');

    const warrior = new SkillProgression([], 'vanguard');
    expect(warrior.canUseSkill('crescent-cleave')).toBe(true);
    expect(warrior.canUseSkill('cinder-burst')).toBe(false);
    expect(warrior.availableChoices.map(choice => choice.id)).not.toContain('skill:crescent-cleave');
    expect(warrior.availableChoices.map(choice => choice.id)).toContain('skill:cinder-burst');
    warrior.offer('cache');
    expect(warrior.choose('cache', 'skill:cinder-burst')).toBe(true);
    expect(warrior.pendingUnlocks).toEqual(['skill:cinder-burst']);
    expect(warrior.canUseSkill('cinder-burst')).toBe(false);
    expect(warrior.setCharacterClass('arcanist')).toBe(false);
    expect(warrior.characterClass).toBe('vanguard');
  });

  it('preserves legacy characters and permanently locks their class without losing gear', () => {
    const storage = new Storage();
    const old = { schema: 1, revision: 7, completed: 3, items: [],
      unlocks: ['skill:frost-bloom'], forgeEmbers: 2 };
    storage.values.set(STASH_STORAGE_KEY, JSON.stringify(old));
    const saved = new SecuredStash(storage);
    expect(saved.hasCharacter).toBe(true);
    expect(saved.preferredClass).toBe('arcanist');
    expect(saved.selectCharacterClass('vanguard')).toBe(false);
    expect(saved.completedExpeditions).toBe(3);
    expect(saved.unlockedIds).toEqual(['skill:frost-bloom']);
    expect(saved.forgeEmbers).toBe(2);
    expect(saved.secureExpedition([],[],1)).toMatchObject({ok:true,saved:0});
    const next = new SecuredStash(storage);
    expect(next.preferredClass).toBe('arcanist');
    expect(next.completedExpeditions).toBe(4);
    expect(next.forgeEmbers).toBe(3);
    expect(next.unlockedIds).toEqual(['skill:frost-bloom']);
    expect(next.selectCharacterClass('vanguard')).toBe(false);
  });

  it('rejects missing storage, failed writes and stale tabs without changing a class',()=>{
    const storage = new Storage();
    const first = new SecuredStash(storage);
    const stale = new SecuredStash(storage);
    storage.fail = true;
    expect(first.selectCharacterClass('vanguard')).toBe(false);
    expect(first.preferredClass).toBe('arcanist');
    expect(storage.getItem(STASH_STORAGE_KEY)).toBeNull();
    storage.fail = false;
    expect(first.selectCharacterClass('vanguard')).toBe(true);
    expect(stale.selectCharacterClass('arcanist')).toBe(false);
    expect(stale.preferredClass).toBe('arcanist');
    expect(new SecuredStash(storage).preferredClass).toBe('vanguard');
    expect(new SecuredStash(null).selectCharacterClass('vanguard')).toBe(false);
  });

  it('rejects corrupted class values without touching existing save bytes',()=>{
    const storage = new Storage();
    const raw = JSON.stringify({schema:1,revision:2,completed:1,items:[],
      preferredClass:'invalid-class'});
    storage.values.set(STASH_STORAGE_KEY,raw);
    const stash=new SecuredStash(storage);
    expect(stash.status).toBe('corrupt');
    expect(stash.selectCharacterClass('vanguard')).toBe(false);
    expect(stash.secureExpedition([]).ok).toBe(false);
    expect(storage.getItem(STASH_STORAGE_KEY)).toBe(raw);
  });

  it('does not retroactively change any previously awarded unlocks',()=>{
    const s = new SkillProgression(['skill:crescent-cleave','support:focused-power'],'arcanist');
    expect(s.canUseSkill('crescent-cleave')).toBe(true);
    expect(s.canUseSkill('cinder-burst')).toBe(true);
    expect(s.setCharacterClass('vanguard')).toBe(true);
    expect(s.canUseSkill('cinder-burst')).toBe(false);
    expect(s.canUseSkill('crescent-cleave')).toBe(true);
    expect(s.canUseSupport('focused-power')).toBe(true);
    expect(s.setCharacterClass('arcanist')).toBe(true);
    expect(s.canUseSkill('cinder-burst')).toBe(true);
  });
});
