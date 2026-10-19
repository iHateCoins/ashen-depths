import { describe, expect, it } from 'vitest';
import { AutoCombat, type Enemy } from '../src/game/combat/AutoCombat';
import { AutoSkillSystem, CINDER_BURST, FROST_BLOOM, ASH_LANCE, SKILL_SLOT_LIMIT, SKILL_SUPPORTS } from '../src/game/combat/AutoSkillSystem';

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

  it('applies focused power to actual hit damage and narrower enemy coverage', () => {
    const system = new AutoSkillSystem();
    system.setSupport(CINDER_BURST.id, 'focused-power');
    const stats = system.effectiveStats(CINDER_BURST.id);
    expect(stats).toMatchObject({
      supportId: 'focused-power', damage: 47, radius: 79,
      range: 250, cooldownSeconds: 4,
    });
    const targets = [enemy(1, 40), enemy(2, 130)];
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016);
    expect(casts).toHaveLength(1);
    expect(casts[0].radius).toBe(79);
    expect(casts[0].hits).toEqual([{ enemyId: 1, damage: 47 }]);
    expect(targets.map(target => target.hp)).toEqual([53, 100]);
  });

  it('expansive blast actually hits a larger cluster at reduced damage', () => {
    const system = new AutoSkillSystem();
    system.setSupport(CINDER_BURST.id, 'expansive-blast');
    expect(system.effectiveStats(CINDER_BURST.id)).toMatchObject({ damage: 28, radius: 158 });
    const targets = [enemy(1, 40), enemy(2, 185)];
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016);
    expect(casts[0].hits.map(hit => hit.enemyId)).toEqual([1, 2]);
    expect(targets.map(target => target.hp)).toEqual([72, 72]);
  });

  it('swift casting reduces cooldown while reducing real damage', () => {
    const system = new AutoSkillSystem();
    system.setSupport(CINDER_BURST.id, 'swift-casting');
    const targets = [enemy(1, 60, 0, 200)];
    expect(system.effectiveStats(CINDER_BURST.id)).toMatchObject({
      damage: 28, radius: 105, cooldownSeconds: 2.8,
    });
    expect(system.update({ x: 0, y: 0 }, targets, 0.016)[0].hits[0].damage).toBe(28);
    expect(system.remaining(CINDER_BURST.id)).toBe(2.8);
  });

  it('supports are unique across equipped skills and bad changes are atomic', () => {
    const system = new AutoSkillSystem([CINDER_BURST, FROST_BLOOM]);
    expect(SKILL_SUPPORTS).toHaveLength(3);
    system.setSupport(CINDER_BURST.id, 'focused-power');
    expect(() => system.setSupport(FROST_BLOOM.id, 'focused-power')).toThrow(/already equipped/);
    expect(() => system.setSupport(FROST_BLOOM.id, 'missing')).toThrow(/Unknown support/);
    expect(() => system.setSupport('ash-lance', 'swift-casting')).toThrow(/not equipped/);
    expect(system.supportFor(FROST_BLOOM.id)).toBeNull();
    expect(system.supportFor(CINDER_BURST.id)?.id).toBe('focused-power');
    system.setSupport(FROST_BLOOM.id, 'swift-casting');
    system.setSupport(CINDER_BURST.id, null);
    system.setSupport(CINDER_BURST.id, 'swift-casting');
  });

  it('removes modifiers on unequip, preserves consumed cooldown, resets next run', () => {
    const system = new AutoSkillSystem([CINDER_BURST, FROST_BLOOM]);
    system.setSupport(CINDER_BURST.id, 'swift-casting');
    system.update({ x: 0, y: 0 }, [enemy(1, 80)], 0.016);
    const consumed = system.remaining(CINDER_BURST.id);
    expect(consumed).toBe(2.8);
    system.setEquipped([FROST_BLOOM]);
    expect(system.supportFor(CINDER_BURST.id)).toBeNull();
    system.setEquipped([CINDER_BURST, FROST_BLOOM]);
    expect(system.effectiveStats(CINDER_BURST.id).supportId).toBeNull();
    expect(system.remaining(CINDER_BURST.id)).toBe(consumed);
    expect(new AutoSkillSystem().effectiveStats(CINDER_BURST.id).supportId).toBeNull();
  });

  it('line of sight remains enforced after area and damage modifiers', () => {
    const system = new AutoSkillSystem();
    system.setSupport(CINDER_BURST.id, 'expansive-blast');
    const targets = [enemy(1, 50), enemy(2, 170)];
    const clear = (from: { x: number }, to: { x: number }) =>
      !((from.x < 100 && to.x >= 100) || (from.x >= 100 && to.x < 100));
    const casts = system.update({ x: 0, y: 0 }, targets, 0.016, clear);
    expect(casts[0].hits.map(hit => hit.enemyId)).toEqual([1]);
    expect(targets[1].hp).toBe(100);
  });

  it('prevents basic attacks through obstructions', () => {
    const basic = new AutoCombat(250);
    const targets = [enemy(1, 30), enemy(2, 60)];
    expect(basic.update({ x: 0, y: 0 }, targets, 0.016,
      (_from, to) => to.x > 40)).toEqual([{ targetId: 2, damage: 25 }]);
    expect(targets[0].hp).toBe(100);
  });
});
