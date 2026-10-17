import {describe,expect,it} from 'vitest';
import {NavigationGrid} from '../src/game/navigation/Grid';
import {createEnemyAgent,updateEnemyAgents} from '../src/game/combat/EnemyAI';
import {PlayerHealth} from '../src/game/combat/PlayerHealth';
const enemy=(x=80,y=80)=>createEnemyAgent({id:1,position:{x,y},hp:100,maxHp:100});
describe('enemy pursuit',()=>{
  it('does not pursue from outside detection range',()=>{
    const grid=new NavigationGrid(640,640,32), agent=enemy(80,80);
    updateEnemyAgents([agent],{x:500,y:500},grid,0.05);
    expect(agent.position).toEqual({x:80,y:80});
  });
  it('approaches a nearby player without automatic player movement',()=>{
    const grid=new NavigationGrid(640,640,32), agent=enemy(80,80);
    const player={x:180,y:80};
    updateEnemyAgents([agent],player,grid,0.05);
    expect(agent.position.x).toBeGreaterThan(80);
    expect(player).toEqual({x:180,y:80});
  });
  it('does not walk through a blocking wall',()=>{
    const grid=new NavigationGrid(320,320,32), agent=enemy(48,48);
    for(let y=0;y<10;y++)grid.setBlocked({x:2,y});
    for(let i=0;i<50;i++)updateEnemyAgents([agent],{x:160,y:48},grid,0.05);
    expect(agent.position.x).toBeLessThan(64);
  });
  it('deals contact damage on cooldown',()=>{
    const grid=new NavigationGrid(320,320,32), agent=enemy(80,80);
    expect(updateEnemyAgents([agent],{x:90,y:80},grid,0.05)).toHaveLength(1);
    expect(updateEnemyAgents([agent],{x:90,y:80},grid,0.05)).toHaveLength(0);
  });
  it('ignores defeated enemies',()=>{
    const grid=new NavigationGrid(320,320,32), agent=enemy(80,80);
    agent.hp=0;
    expect(updateEnemyAgents([agent],{x:90,y:80},grid,0.05)).toEqual([]);
  });
});
describe('player health',()=>{
  it('clamps damage and marks defeat',()=>{
    const player=new PlayerHealth(100);
    expect(player.damage(120)).toBe(true);
    expect(player.hp).toBe(0);
    expect(player.defeated).toBe(true);
    expect(player.damage(10)).toBe(false);
    player.reset();
    expect(player.hp).toBe(100);
  });
});
