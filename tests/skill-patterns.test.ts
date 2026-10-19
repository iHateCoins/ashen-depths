import { describe, expect, it } from 'vitest';
import type { Enemy } from '../src/game/combat/AutoCombat';
import {
  ARC_RELAY, AutoSkillSystem, CINDER_BURST, PIERCING_VOLLEY,
  skillPatternLabel,
} from '../src/game/combat/AutoSkillSystem';
import { UNLOCK_CHOICES, SkillProgression } from '../src/game/combat/SkillProgression';
import { SecuredStash, type StashStorage } from '../src/game/loot/SecuredStash';

const enemy = (id: number, x: number, y: number, hp = 200): Enemy => ({
  id, position: { x, y }, hp, maxHp: hp,
});

class MemoryStorage implements StashStorage {
  data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('M05 PR05 pattern-targeted auto skills', () => {
  it('pierces collinear enemies but not off-axis targets', () => {
    const system = new AutoSkillSystem([PIERCING_VOLLEY]);
    const targets = [
      enemy(1, 80, 0), enemy(2, 160, 12), enemy(3, 240, -12), enemy(4, 140, 98),
    ];
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016);
    expect(casts).toHaveLength(1);
    expect(casts[0]).toMatchObject({ pattern: 'pierce', radius: 28, targetId: 1 });
    expect(casts[0].hits.map(hit => hit.enemyId)).toEqual([1, 2, 3]);
    expect(casts[0].hits.map(hit => hit.damage)).toEqual([38, 38, 38]);
    expect(casts[0].path).toEqual([{ x: 0, y: 0 }, { x: 280, y: 0 }]);
    expect(targets[3].hp).toBe(200);
  });

  it('piercing refuses to hit targets through walls and still fires at reachable enemies', () => {
    const system = new AutoSkillSystem([PIERCING_VOLLEY]);
    const targets = [enemy(1, 80, 0), enemy(2, 160, 0), enemy(3, 240, 0)];
    const lineOfSight = (_from: { x: number; y: number }, to: { x: number; y: number }) => to.x < 200;
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016, lineOfSight);
    expect(casts[0].hits.map(hit => hit.enemyId)).toEqual([1, 2]);
    expect(targets[2].hp).toBe(200);
  });

  it('chains through at most three different enemies with diminishing damage', () => {
    const system = new AutoSkillSystem([ARC_RELAY]);
    const targets = [
      enemy(1, 70, 0), enemy(2, 180, 0), enemy(3, 295, 0), enemy(4, 415, 0),
    ];
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016);
    expect(casts).toHaveLength(1);
    expect(casts[0]).toMatchObject({ pattern: 'chain', targetId: 1, radius: 155 });
    expect(casts[0].hits).toEqual([
      { enemyId: 1, damage: 45 }, { enemyId: 2, damage: 36 },
      { enemyId: 3, damage: 27 },
    ]);
    expect(casts[0].path).toEqual([
      { x: 70, y: 0 }, { x: 180, y: 0 }, { x: 295, y: 0 },
    ]);
    expect(targets[3].hp).toBe(200);
  });

  it('chain jumping respects each wall and never revisits a target', () => {
    const system = new AutoSkillSystem([ARC_RELAY]);
    const targets = [enemy(1, 70, 0), enemy(2, 180, 0), enemy(3, 295, 0)];
    const clear = (_from: { x: number }, to: { x: number }) => to.x < 250;
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016, clear);
    expect(casts[0].hits.map(hit => hit.enemyId)).toEqual([1, 2]);
    expect(targets[2].hp).toBe(200);
  });

  it('Attack Power and Spell Power scale the corresponding new behavior only', () => {
    const skills = new AutoSkillSystem([PIERCING_VOLLEY, ARC_RELAY]);
    skills.bonusAttackDamage = 12;
    skills.bonusDamage = 8;
    expect(skills.effectiveStats(PIERCING_VOLLEY.id)).toMatchObject({ type: 'attack', damage: 50 });
    expect(skills.effectiveStats(ARC_RELAY.id)).toMatchObject({ type: 'spell', damage: 53 });
    skills.setSupport(PIERCING_VOLLEY.id, 'expansive-blast');
    skills.setSupport(ARC_RELAY.id, 'swift-casting');
    expect(skills.effectiveStats(PIERCING_VOLLEY.id)).toMatchObject({
      damage: 40, radius: 42, cooldownSeconds: 3.8,
    });
    expect(skills.effectiveStats(ARC_RELAY.id)).toMatchObject({
      damage: 42, radius: 155, cooldownSeconds: 3.64,
    });
    expect(skillPatternLabel(PIERCING_VOLLEY, 42)).toContain('42px half-width');
    expect(skillPatternLabel(ARC_RELAY, 155)).toContain('up to 3 foes');
    expect(skillPatternLabel(CINDER_BURST, 105)).toBe('105px area');
  });

  it('secures the entire expanding unlock catalog without invalidating old stash saves', () => {
    const storage = new MemoryStorage();
    const stash = new SecuredStash(storage);
    const allUnlocks = UNLOCK_CHOICES.map(choice => choice.id);
    expect(allUnlocks).toHaveLength(8); // 5 active unlocks + 3 supports
    expect(stash.secureExpedition([], allUnlocks)).toMatchObject({ ok: true });
    const reload = new SecuredStash(storage);
    expect(reload.status).toBe('ready');
    expect(reload.unlockedIds).toHaveLength(allUnlocks.length);
    const progression = new SkillProgression(reload.unlockedIds);
    expect(progression.canUseSkill('piercing-volley')).toBe(true);
    expect(progression.canUseSkill('arc-relay')).toBe(true);
    expect(progression.canUseSkill('crescent-cleave')).toBe(true);
    expect(progression.availableChoices).toEqual([]);
  });

  it('leaves the existing area skills unchanged', () => {
    const system = new AutoSkillSystem([CINDER_BURST]);
    const targets = [enemy(1, 50, 0), enemy(2, 90, 0)];
    const cast = system.update({ x: 0, y: 0 }, targets, 0.016)[0];
    expect(cast.pattern).toBe('area');
    expect(cast.hits.map(hit => hit.enemyId)).toEqual([1, 2]);
    expect(cast.path).toBeUndefined();
  });
});
