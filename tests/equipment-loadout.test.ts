import { describe, expect, it } from 'vitest';
import { EquipmentLoadout, itemBonuses, mitigatedHitDamage } from '../src/game/loot/EquipmentLoadout';
import { ExpeditionLoot, type LootItem } from '../src/game/loot/ExpeditionLoot';
import { AutoCombat } from '../src/game/combat/AutoCombat';
import { AutoSkillSystem, CINDER_BURST } from '../src/game/combat/AutoSkillSystem';
import { PlayerHealth } from '../src/game/combat/PlayerHealth';

function item(id: string, slot: LootItem['slot'], affixes: LootItem['affixes'] = []): LootItem {
  return {
    id, slot, name: `Test ${id}`, baseName: 'Test Item', rarity: 'rare',
    itemLevel: 5, affixes,
  };
}

describe('three-slot equipment ownership', () => {
  it('equip moves the actual item from bag into a slot without duplication', () => {
    const loot = new ExpeditionLoot(42);
    const weapon = item('sword', 'weapon', [{ id: 'sharp', label: 'Attack Power', value: 7 }]);
    loot.bag.push(weapon);
    const loadout = new EquipmentLoadout(loot);
    expect(loadout.stats).toEqual({ attack: 0, spell: 0, armor: 0, health: 0 });
    expect(loadout.previewEquip(weapon).attack).toBe(16);
    expect(loadout.equip('sword')).toBe('equipped');
    expect(loadout.get('weapon')).toBe(weapon);
    expect(loot.bag).toHaveLength(0);
    expect(loadout.stats.attack).toBe(16);
    expect(loadout.equippedCount).toBe(1);
    expect(loadout.equip('sword')).toBe('not-found');
  });

  it('swaps worn weapons atomically and keeps old item in the bag, including when full', () => {
    const loot = new ExpeditionLoot(42, 2);
    const one = item('first', 'weapon');
    const two = item('second', 'weapon', [{ id: 'sharp', label: 'Attack Power', value: 6 }]);
    const charm = item('third', 'charm');
    loot.bag.push(one, two);
    const loadout = new EquipmentLoadout(loot);
    loadout.equip(one.id);
    loot.bag.push(charm);
    expect(loot.bagFull).toBe(true);
    expect(loadout.equip(two.id)).toBe('equipped');
    expect(loadout.get('weapon')).toBe(two);
    expect(loot.bag.map(i => i.id).sort()).toEqual(['first','third']);
    expect(new Set([...loot.bag, loadout.get('weapon')!].map(i => i.id)).size).toBe(3);
    expect(loadout.previewEquip(one).attack).toBe(itemBonuses(one).attack);
  });

  it('unequip refuses a full bag and leaves the worn gear intact', () => {
    const loot = new ExpeditionLoot(1, 1);
    const weapon = item('sword','weapon');
    const charm = item('charm','charm');
    loot.bag.push(weapon);
    const loadout = new EquipmentLoadout(loot);
    loadout.equip('sword');
    loot.bag.push(charm);
    expect(loadout.unequip('weapon')).toBe('bag-full');
    expect(loadout.get('weapon')).toBe(weapon);
    expect(loot.bag.map(i=>i.id)).toEqual(['charm']);
    loot.bag.pop();
    expect(loadout.unequip('weapon')).toBe('unequipped');
    expect(loadout.unequip('weapon')).toBe('empty');
    expect(loadout.equippedCount).toBe(0);
    expect(loot.bag).toEqual([weapon]);
  });

  it('aggregates four stats across the three slots and replaces only the matching slot', () => {
    const loot = new ExpeditionLoot(5);
    const weapon = item('sword','weapon', [
      { id:'sharp', label:'Attack Power', value:3 },
      { id:'ember', label:'Ember Potency', value:4 },
    ]);
    const armor = item('vest','armor',[
      { id:'sturdy', label:'Armor', value:6 },
      { id:'vital', label:'Maximum Health', value:9 },
    ]);
    const charm = item('charm','charm',[
      { id:'vital', label:'Maximum Health', value:2 },
      { id:'ember', label:'Ember Potency', value:7 },
    ]);
    const newArmor = item('newVest','armor',[]);
    loot.bag.push(weapon, armor, charm, newArmor);
    const loadout = new EquipmentLoadout(loot);
    for (const id of ['sword','vest','charm']) expect(loadout.equip(id)).toBe('equipped');
    expect(loadout.stats).toEqual({ attack: 12, armor: 9, spell: 15, health: 11 });
    const before = loadout.stats;
    const next = loadout.previewEquip(newArmor);
    expect(next.attack).toBe(before.attack);
    expect(next.spell).toBe(before.spell);
    expect(next.health).toBe(2);
    expect(next.armor).toBe(3);
    expect(loadout.stats).toEqual(before);
  });

  it('equipped items are not discardable from the carried bag', () => {
    const loot = new ExpeditionLoot(123);
    const weapon = item('sword','weapon');
    loot.bag.push(weapon);
    const loadout = new EquipmentLoadout(loot);
    loadout.equip(weapon.id);
    expect(loot.discard(weapon.id, {x:10,y:10})).toBeNull();
    expect(loadout.get('weapon')?.id).toBe(weapon.id);
    expect(loot.ground).toHaveLength(0);
  });

  it('all equipped and carried gear resets with the run without changing seeded rolls', () => {
    const first = new ExpeditionLoot(42);
    const firstLoadout = new EquipmentLoadout(first);
    first.bag.push(item('sword','weapon'));
    firstLoadout.equip('sword');
    const second = new ExpeditionLoot(42);
    const secondLoadout = new EquipmentLoadout(second);
    expect(secondLoadout.equippedCount).toBe(0);
    expect(secondLoadout.stats.attack).toBe(0);
    expect(second.bag).toHaveLength(0);
    expect(firstLoadout.get('weapon')).not.toBeNull();
  });
});

describe('worn gear stat effects', () => {
  it('an item base is useful even without rarity affixes', () => {
    expect(itemBonuses(item('weapon','weapon')).attack).toBe(9);
    expect(itemBonuses(item('armor','armor')).armor).toBe(3);
    expect(itemBonuses(item('charm','charm')).spell).toBe(4);
  });

  it('automatic attacks incorporate a weapon bonus without resetting cooldown', () => {
    const combat = new AutoCombat();
    const enemies = [{ id:1,position:{x:0,y:0},hp:100,maxHp:100 }];
    expect(combat.update({x:0,y:0},enemies,0.016)[0].damage).toBe(25);
    const remaining = combat.cooldown;
    combat.bonusDamage = 14;
    expect(combat.cooldown).toBe(remaining);
    for (let i=0;i<7;i++) combat.update({x:0,y:0},[],0.1);
    expect(combat.update({x:0,y:0},enemies,0.016)[0].damage).toBe(39);
  });

  it('spell bonus applies to Cinder Burst and its reported hits', () => {
    const skills = new AutoSkillSystem();
    skills.bonusDamage = 9;
    const enemies = [{id:1,position:{x:60,y:40},hp:100,maxHp:100}];
    const casts = skills.update({x:40,y:40},enemies,0.016);
    expect(casts).toHaveLength(1);
    expect(casts[0].hits).toEqual([{enemyId:1,damage:CINDER_BURST.damage+9}]);
    expect(enemies[0].hp).toBe(56);
    skills.bonusDamage = 0;
    expect(skills.remaining('cinder-burst')).toBeGreaterThan(0);
  });

  it('armor reduces wretch and brute strike damage without allowing invulnerability', () => {
    expect(mitigatedHitDamage(8, 0)).toBe(8);
    expect(mitigatedHitDamage(8, 3)).toBe(5);
    expect(mitigatedHitDamage(22, 9)).toBe(13);
    expect(mitigatedHitDamage(8, 22)).toBe(1);
    expect(mitigatedHitDamage(8, 1000)).toBe(1);
    expect(mitigatedHitDamage(8, -100)).toBe(8);
    expect(mitigatedHitDamage(0, 50)).toBe(0);
  });

  it('health equipment preserves missing HP and cannot kill when unequipped', () => {
    const health = new PlayerHealth(100);
    health.damage(25);
    health.setMaxHp(120);
    expect(health.hp).toBe(95);
    expect(health.maxHp).toBe(120);
    health.setMaxHp(100);
    expect(health.hp).toBe(75);
    health.damage(74);
    expect(health.hp).toBe(1);
    health.setMaxHp(50);
    expect(health.hp).toBe(1);
    expect(health.defeated).toBe(false);
    expect(() => health.setMaxHp(0)).toThrow();
    health.damage(3);
    expect(health.defeated).toBe(true);
    health.setMaxHp(200);
    expect(health.hp).toBe(0);
  });
});
