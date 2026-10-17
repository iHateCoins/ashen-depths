import {describe,it,expect} from 'vitest';
import {AutoCombat,type Enemy} from '../src/game/combat/AutoCombat';
const enemies = (): Enemy[] => [
  {id:1,position:{x:100,y:0},hp:50,maxHp:50},
  {id:2,position:{x:30,y:0},hp:50,maxHp:50}
];
describe('automatic combat',()=>{
  it('attacks nearest living enemy in range',()=>{
    const combat=new AutoCombat(80,20,0.7), targets=enemies();
    expect(combat.update({x:0,y:0},targets,0.016)).toEqual([{targetId:2,damage:20}]);
    expect(targets[1].hp).toBe(30);
  });
  it('respects cooldown and does not attack out of range',()=>{
    const combat=new AutoCombat(80,20,0.7), targets=enemies();
    combat.update({x:0,y:0},targets,0.016);
    expect(combat.update({x:0,y:0},targets,0.1)).toEqual([]);
    expect(combat.update({x:500,y:500},targets,0.7)).toEqual([]);
  });
  it('does not target dead enemies',()=>{
    const combat=new AutoCombat(80,20,0.7), targets=enemies();
    targets[1].hp=0;
    expect(combat.update({x:0,y:0},targets,0.016)).toEqual([]);
  });
  it('clamps health at zero',()=>{
    const combat=new AutoCombat(80,100,0.7), targets=enemies();
    combat.update({x:0,y:0},targets,0.016);
    expect(targets[1].hp).toBe(0);
  });
});
