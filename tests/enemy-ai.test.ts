import { describe, expect, it } from 'vitest';
import { NavigationGrid } from '../src/game/navigation/Grid';
import {
  createEnemyAgent, ENEMY_ARCHETYPES, updateEnemyAgents, type EnemyAgent,
} from '../src/game/combat/EnemyAI';
import { PlayerHealth } from '../src/game/combat/PlayerHealth';

const grid = () => new NavigationGrid(640, 640, 32);
const wretch = (x = 80, y = 80): EnemyAgent =>
  createEnemyAgent({ id: 1, position: { x, y }, hp: 100, maxHp: 100 });
const brute = (x = 80, y = 80): EnemyAgent =>
  createEnemyAgent({ id: 2, position: { x, y }, hp: 220, maxHp: 220 }, 'brute');
const advance = (agent: EnemyAgent, player: { x: number; y: number }, map: NavigationGrid, frames: number) => {
  const strikes = [];
  for (let i = 0; i < frames; i++) strikes.push(...updateEnemyAgents([agent], player, map, 0.05));
  return strikes;
};

describe('enemy pursuit', () => {
  it('does not pursue outside detection range', () => {
    const agent = wretch();
    updateEnemyAgents([agent], { x: 500, y: 500 }, grid(), 0.05);
    expect(agent.position).toEqual({ x: 80, y: 80 });
    expect(agent.aggro).toBe(false);
  });

  it('approaches a nearby player without automatically moving that player', () => {
    const agent = wretch();
    const player = { x: 180, y: 80 };
    updateEnemyAgents([agent], player, grid(), 0.05);
    expect(agent.position.x).toBeGreaterThan(80);
    expect(player).toEqual({ x: 180, y: 80 });
  });

  it('does not chase through a blocking wall', () => {
    const map = grid();
    const agent = wretch(48, 48);
    for (let y = 0; y < map.rows; y++) map.setBlocked({ x: 2, y });
    advance(agent, { x: 160, y: 48 }, map, 55);
    expect(agent.position.x).toBeLessThan(64);
    expect(agent.phase).toBe('chase');
  });

  it('stops chasing when player escapes aggro range', () => {
    const agent = wretch();
    updateEnemyAgents([agent], { x: 180, y: 80 }, grid(), 0.05);
    expect(agent.aggro).toBe(true);
    updateEnemyAgents([agent], { x: 620, y: 620 }, grid(), 0.05);
    expect(agent.aggro).toBe(false);
    expect(agent.attackTarget).toBeNull();
  });
});

describe('telegraphed contact attacks', () => {
  it('warns before dealing any damage, then recovers', () => {
    const agent = wretch();
    const player = { x: 90, y: 80 };
    const map = grid();

    expect(updateEnemyAgents([agent], player, map, 0.05)).toEqual([]);
    expect(agent.phase).toBe('windup');
    expect(agent.attackTarget).toEqual(player);
    expect(advance(agent, player, map, 6)).toEqual([]);

    const strikes = advance(agent, player, map, 8);
    expect(strikes).toEqual([{
      enemyId: 1, kind: 'wretch', center: player,
      radius: ENEMY_ARCHETYPES.wretch.attackRadius,
      damage: 8, hit: true,
    }]);
    expect(agent.phase).toBe('recovery');
    expect(advance(agent, player, map, 8)).toEqual([]);
  });

  it('locks target position so stepping aside dodges the strike', () => {
    const agent = wretch();
    const map = grid();
    updateEnemyAgents([agent], { x: 90, y: 80 }, map, 0.05);
    const original = agent.attackTarget;
    const strikes = advance(agent, { x: 200, y: 80 }, map, 13);
    expect(original).toEqual({ x: 90, y: 80 });
    expect(strikes).toHaveLength(1);
    expect(strikes[0].hit).toBe(false);
    expect(strikes[0].center).toEqual(original);
  });

  it('cancels a windup when killed before impact', () => {
    const agent = wretch();
    const map = grid();
    updateEnemyAgents([agent], { x: 90, y: 80 }, map, 0.05);
    agent.hp = 0;
    expect(advance(agent, { x: 90, y: 80 }, map, 20)).toEqual([]);
    expect(agent.phase).toBe('chase');
    expect(agent.attackTarget).toBeNull();
  });

  it('brute has a longer and stronger windup than a wretch', () => {
    const agent = brute();
    const player = { x: 110, y: 80 };
    const map = grid();
    updateEnemyAgents([agent], player, map, 0.05);
    expect(agent.phase).toBe('windup');
    expect(agent.phaseRemaining).toBe(ENEMY_ARCHETYPES.brute.windupSeconds);
    expect(ENEMY_ARCHETYPES.brute.attackDamage).toBeGreaterThan(ENEMY_ARCHETYPES.wretch.attackDamage);
    expect(advance(agent, player, map, 10)).toEqual([]);
    const strikes = advance(agent, player, map, 12);
    expect(strikes).toHaveLength(1);
    expect(strikes[0].damage).toBe(22);
    expect(strikes[0].hit).toBe(true);
  });

  it('never starts a strike through a solid wall', () => {
    const map = grid();
    map.setBlocked({ x: 2, y: 2 });
    const agent = brute(48, 80);
    updateEnemyAgents([agent], { x: 112, y: 80 }, map, 0.05);
    expect(agent.phase).toBe('chase');
    expect(agent.attackTarget).toBeNull();
  });

  it('does not double-strike on large frame pauses', () => {
    const agent = wretch();
    const player = { x: 90, y: 80 };
    const map = grid();
    updateEnemyAgents([agent], player, map, 0.05);
    const strikes = updateEnemyAgents([agent], player, map, 5);
    expect(strikes).toEqual([]);
    expect(agent.phase).toBe('windup');
  });
});

describe('player health', () => {
  it('clamps damage and marks defeat', () => {
    const player = new PlayerHealth(100);
    expect(player.damage(120)).toBe(true);
    expect(player.hp).toBe(0);
    expect(player.defeated).toBe(true);
    expect(player.damage(10)).toBe(false);
    player.reset();
    expect(player.hp).toBe(100);
  });
});
