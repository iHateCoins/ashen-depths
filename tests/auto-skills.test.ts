import { describe, expect, it } from 'vitest';
import { AutoCombat, type Enemy } from '../src/game/combat/AutoCombat';
import { AutoSkillSystem, CINDER_BURST } from '../src/game/combat/AutoSkillSystem';

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

  it('prevents basic attacks through obstructions', () => {
    const basic = new AutoCombat(250);
    const targets = [enemy(1, 30), enemy(2, 60)];
    expect(basic.update({ x: 0, y: 0 }, targets, 0.016,
      (_from, to) => to.x > 40)).toEqual([{ targetId: 2, damage: 25 }]);
    expect(targets[0].hp).toBe(100);
  });
});
