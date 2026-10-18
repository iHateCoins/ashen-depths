import type { Point } from '../movement/MovementController';
import type { Enemy } from './AutoCombat';
import { NavigationGrid } from '../navigation/Grid';
import { findPath } from '../navigation/Pathfinder';

export interface EnemyAgent extends Enemy {
  aggro: boolean;
  attackCooldown: number;
  path: Point[];
  repathTimer: number;
}
export interface EnemyHit { enemyId: number; damage: number }

export function createEnemyAgent(enemy: Enemy): EnemyAgent {
  return {...enemy, position: {...enemy.position}, aggro: false, attackCooldown: 0, path: [], repathTimer: 0};
}
export function updateEnemyAgents(agents: EnemyAgent[], player: Point, grid: NavigationGrid, dt: number): EnemyHit[] {
  if (!Number.isFinite(dt) || dt <= 0) return [];
  const step = Math.min(dt, 0.05);
  const hits: EnemyHit[] = [];
  for (const enemy of agents) {
    if (enemy.hp <= 0) continue;
    let distance = Math.hypot(player.x-enemy.position.x, player.y-enemy.position.y);
    if (distance < 290) enemy.aggro = true;
    if (distance > 520) { enemy.aggro = false; enemy.path = []; }
    if (!enemy.aggro) continue;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown-step);
    if (distance <= 36) {
      if (enemy.attackCooldown === 0) {
        hits.push({enemyId: enemy.id, damage: 8});
        enemy.attackCooldown = 1.1;
      }
      continue;
    }
    enemy.repathTimer -= step;
    if (enemy.repathTimer <= 0 || enemy.path.length === 0) {
      enemy.path = findPath(grid, enemy.position, player) ?? [];
      enemy.repathTimer = 0.35;
    }
    if (!enemy.path.length) continue;
    const target = enemy.path[0];
    const dx = target.x-enemy.position.x, dy = target.y-enemy.position.y;
    const length = Math.hypot(dx,dy);
    const travel = Math.min(length, 82*step);
    if (length < 0.01) { enemy.path.shift(); continue; }
    const next = {x:enemy.position.x+dx/length*travel, y:enemy.position.y+dy/length*travel};
    if (grid.isSegmentWalkable(enemy.position,next)) enemy.position = next;
    else {enemy.path=[];enemy.repathTimer=0;}
    if (travel >= length-0.01) enemy.path.shift();
    distance = Math.hypot(player.x-enemy.position.x, player.y-enemy.position.y);
  }
  return hits;
}
