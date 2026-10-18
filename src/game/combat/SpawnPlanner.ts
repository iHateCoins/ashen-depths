import type { Point } from '../movement/MovementController';
import { NavigationGrid, type Cell } from '../navigation/Grid';
import type { EnemyKind } from './EnemyAI';

export interface PlannedEnemy { kind: EnemyKind; position: Point }

const CARDINAL = [
  {x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},
] as const;

/**
 * Walk only the connected component the player can reach, then choose
 * separated, visible-floor spawn positions. This matters in seeded dungeons:
 * randomly sampling points in solid rock would otherwise spend thousands of
 * pathfinding attempts before each wave starts.
 *
 * Candidates are ordered deterministically by distance and seed-like wave
 * jitter; first prefer nearby combat, then fall back to any reachable floor.
 */
export function planEncounterSpawns(
  grid: NavigationGrid,
  origin: Point,
  kinds: readonly EnemyKind[],
  wave: number,
): PlannedEnemy[] {
  const start = grid.cellAt(origin);
  if (!grid.isWalkable(start)) return [];

  const queue: Cell[] = [start];
  const visited = new Set<string>([grid.key(start)]);
  const candidateCells: { position: Point; distance: number; score: number }[] = [];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const position = grid.center(cell);
    const distance = Math.hypot(position.x - origin.x, position.y - origin.y);
    if (distance >= 100 && distance <= 520 &&
        position.x >= 32 && position.y >= 32 &&
        position.x <= grid.width - 32 && position.y <= grid.height - 32) {
      const noise = (((cell.x * 73856093) ^ (cell.y * 19349663) ^ (wave * 83492791)) >>> 0) % 27;
      const preferredRadius = 195 + Math.min(2, wave - 1) * 20;
      candidateCells.push({
        position, distance,
        score: Math.abs(distance - preferredRadius) + noise,
      });
    }
    for (const step of CARDINAL) {
      const next = {x:cell.x+step.x,y:cell.y+step.y};
      const key = grid.key(next);
      if (grid.isWalkable(next) && !visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  candidateCells.sort((a,b) => a.score - b.score || a.position.y - b.position.y || a.position.x - b.position.x);

  const result: PlannedEnemy[] = [];
  for (const kind of kinds) {
    const candidate = candidateCells.find(item => !result.some(other =>
      Math.hypot(other.position.x - item.position.x, other.position.y - item.position.y) < 70
    ));
    if (!candidate) break;
    result.push({kind,position:{...candidate.position}});
    const index = candidateCells.indexOf(candidate);
    candidateCells.splice(index,1);
  }
  return result;
}
