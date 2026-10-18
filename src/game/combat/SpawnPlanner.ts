import type { Point } from '../movement/MovementController';
import { NavigationGrid } from '../navigation/Grid';
import { findPath } from '../navigation/Pathfinder';
import type { EnemyKind } from './EnemyAI';

export interface PlannedEnemy { kind: EnemyKind; position: Point }

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RADII = [200, 250, 305, 165, 335, 120];

/**
 * Find reachable, non-overlapping positions in an annulus around the player.
 * Fixed candidate order and no random/global state keeps builds reproducible.
 * Unreachable or crowded layouts may return fewer spawns instead of placing
 * enemies inside walls or on top of the player.
 */
export function planEncounterSpawns(
  grid: NavigationGrid,
  origin: Point,
  kinds: readonly EnemyKind[],
  wave: number,
): PlannedEnemy[] {
  if (!grid.isWalkable(grid.cellAt(origin))) return [];

  const result: PlannedEnemy[] = [];
  const usedCells = new Set<string>();
  let candidateIndex = 0;

  for (const kind of kinds) {
    let chosen: Point | null = null;
    for (let attempt = 0; attempt < 180; attempt++) {
      const index = candidateIndex++;
      const radius = RADII[(index + wave) % RADII.length];
      const angle = wave * 0.67 + index * GOLDEN_ANGLE;
      const raw = {
        x: origin.x + Math.cos(angle) * radius,
        y: origin.y + Math.sin(angle) * radius,
      };
      if (raw.x < 32 || raw.y < 32 ||
          raw.x >= grid.width - 32 || raw.y >= grid.height - 32) continue;

      const cell = grid.cellAt(raw);
      const key = grid.key(cell);
      if (usedCells.has(key) || !grid.isWalkable(cell)) continue;
      const point = grid.center(cell);
      if (Math.hypot(point.x - origin.x, point.y - origin.y) < 100) continue;
      if (result.some(other =>
        Math.hypot(other.position.x - point.x, other.position.y - point.y) < 64)) continue;
      if (!findPath(grid, origin, point)) continue;

      chosen = point;
      usedCells.add(key);
      break;
    }
    if (!chosen) break;
    result.push({ kind, position: chosen });
  }
  return result;
}
