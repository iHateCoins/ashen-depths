import { describe, expect, it } from 'vitest';
import { AutoCombat, type Enemy } from '../src/game/combat/AutoCombat';
import { AutoSkillSystem, CINDER_BURST, FROST_BLOOM, ASH_LANCE, SKILL_SLOT_LIMIT } from '../src/game/combat/AutoSkillSystem';

const enemy = (id: number, x: number, y = 0, hp = 100): Enemy =>
  ({ id, position: { x, y }, hp, maxHp: 100 });

describe('automatic skill selection', () => {
  it('casts by itself, damages clustered enemies and returns presentation events', () => {
    const system = new AutoSkillSystem();
    const targets = [enemy(1, 70), enemy(2, 120), enemy(3, 220)];
    const result = system.update({ x: 0, y: 0 }, targets, 0.016);
    expect(result).toHaveLength(1);
    expect(result[0].targetId).toBe(2); // Middle enemy hits all three.
    expect(result[0].hits.map(hit => hit.enemyId)).toEqual([1, 2, 3]);
    expect(targets.map(target => target.hp)).toEqual([65, 65, 65]);
    expect(system.remaining('cinder-burst')).toBe(CINDER_BURST.cooldownSeconds);
  });

  it('does not trigger while cooling down or without enemies in range', () => {
    const system = new AutoSkillSystem();
    const targets = [enemy(1, 70)];
    expect(system.update({ x: 0, y: 0 }, targets, 0.016)).toHaveLength(1);
    expect(system.update({ x: 0, y: 0 }, targets, 0.016)).toEqual([]);
    expect(system.update({ x: 0, y: 0 }, targets, 0.1)).toEqual([]);
    for (let i = 0; i < 40; i++) system.update({ x: 0, y: 0 }, [], 0.1);
    expect(system.remaining('cinder-burst')).toBe(0);
    expect(system.update({ x: 0, y: 0 }, [enemy(2, 500)], 0.016)).toEqual([]);
    expect(system.update({ x: 0, y: 0 }, targets, 0.016)).toHaveLength(1);
  });

  it('cannot target through a solid barrier or splash through it', () => {
    const system = new AutoSkillSystem();
    const targets = [enemy(1, 65), enemy(2, 85), enemy(3, 150)];
    const clear = (from: { x: number }, to: { x: number }): boolean =>
      !((from.x < 100 && to.x >= 100) || (from.x >= 100 && to.x < 100));
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016, clear);
    expect(casts).toHaveLength(1);
    expect(casts[0].hits.map(hit => hit.enemyId)).toEqual([1, 2]);
    expect(targets[2].hp).toBe(100);
  });

  it('ignores dead targets and clamps lethal damage', () => {
    const system = new AutoSkillSystem();
    const targets = [enemy(1, 65, 0, 0), enemy(2, 90, 0, 20)];
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016);
    expect(casts[0].hits).toEqual([{ enemyId: 2, damage: 35 }]);
    expect(targets[1].hp).toBe(0);
  });

  it('permits only one equipped copy per skill ID', () => {
    expect(() => new AutoSkillSystem([CINDER_BURST, CINDER_BURST])).toThrow(/Duplicate/);
  });

  it('enforces exactly two active slots and a single copy of each skill', () => {
    expect(SKILL_SLOT_LIMIT).toBe(2);
    expect(() => new AutoSkillSystem([CINDER_BURST, FROST_BLOOM, ASH_LANCE])).toThrow(/slots full/);
    const system = new AutoSkillSystem([CINDER_BURST, FROST_BLOOM]);
    expect(system.equipped.map(skill => skill.id)).toEqual(['cinder-burst', 'frost-bloom']);
    expect(() => system.setEquipped([ASH_LANCE, ASH_LANCE])).toThrow(/Duplicate/);
    expect(system.equipped.map(skill => skill.id)).toEqual(['cinder-burst', 'frost-bloom']);
    system.setEquipped([FROST_BLOOM, ASH_LANCE]);
    expect(system.equipped.map(skill => skill.id)).toEqual(['frost-bloom', 'ash-lance']);
  });

  it('preserves cooldown of a still-equipped skill while replacing the other', () => {
    const system = new AutoSkillSystem([CINDER_BURST, FROST_BLOOM]);
    const targets = [enemy(1, 90, 0, 300)];
    expect(system.update({ x: 0, y: 0 }, targets, 0.016)).toHaveLength(2);
    const frostCooldown = system.remaining(FROST_BLOOM.id);
    system.setEquipped([FROST_BLOOM, ASH_LANCE]);
    expect(system.remaining(FROST_BLOOM.id)).toBe(frostCooldown);
    expect(system.remaining(ASH_LANCE.id)).toBe(0);
    expect(system.remaining(CINDER_BURST.id)).toBe(CINDER_BURST.cooldownSeconds);
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016);
    expect(casts.map(cast => cast.skillId)).toEqual([ASH_LANCE.id]);
    system.setEquipped([CINDER_BURST, ASH_LANCE]);
    expect(system.remaining(CINDER_BURST.id)).toBe(CINDER_BURST.cooldownSeconds);
  });

  it('supports single-target lance and broad-area frost without manual attack input', () => {
    const system = new AutoSkillSystem([ASH_LANCE, FROST_BLOOM]);
    const targets = [enemy(1, 80, 0, 200), enemy(2, 145, 0, 200)];
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016);
    expect(casts.map(cast => cast.skillId)).toEqual([ASH_LANCE.id, FROST_BLOOM.id]);
    expect(casts[0].hits).toHaveLength(1);
    expect(casts[1].hits).toHaveLength(2);
  });

  it('permits empty loadouts and rejects bad replacements without changing current skills', () => {
    const system = new AutoSkillSystem();
    system.setEquipped([]);
    expect(system.update({ x: 0, y: 0 }, [enemy(1, 50)], 0.016)).toEqual([]);
    system.setEquipped([CINDER_BURST]);
    expect(() => system.setEquipped([{ ...CINDER_BURST, damage: -1 }])).toThrow(/Invalid/);
    expect(system.equipped.map(skill => skill.id)).toEqual([CINDER_BURST.id]);
  });

  it('prevents basic attacks through obstructions', () => {
    const basic = new AutoCombat(250);
    const targets = [enemy(1, 30), enemy(2, 60)];
    expect(basic.update({ x: 0, y: 0 }, targets, 0.016,
      (_from, to) => to.x > 40)).toEqual([{ targetId: 2, damage: 25 }]);
    expect(targets[0].hp).toBe(100);
  });
});
