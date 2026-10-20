import type { Point } from '../movement/MovementController';
import type { Enemy } from './AutoCombat';
import { NavigationGrid } from '../navigation/Grid';
import { findPath } from '../navigation/Pathfinder';

export type EnemyKind = 'wretch' | 'brute' | 'skirmisher';
export type EnemyPhase = 'chase' | 'windup' | 'recovery';

export interface EnemyArchetype {
  hp: number;
  speed: number;
  detectionRange: number;
  disengageRange: number;
  attackRange: number;
  attackRadius: number;
  windupSeconds: number;
  recoverySeconds: number;
  attackDamage: number;
}

export const ENEMY_ARCHETYPES: Readonly<Record<EnemyKind, Readonly<EnemyArchetype>>> = {
  wretch: {
    hp: 100, speed: 82, detectionRange: 290, disengageRange: 520,
    attackRange: 42, attackRadius: 44, windupSeconds: 0.6,
    recoverySeconds: 1, attackDamage: 8,
  },
  brute: {
    hp: 220, speed: 63, detectionRange: 320, disengageRange: 560,
    attackRange: 85, attackRadius: 75, windupSeconds: 1.05,
    recoverySeconds: 1.6, attackDamage: 22,
  },
  /** Deeper-floor flanker: short telegraph and fast chase, but fragile. */
  skirmisher: {
    hp: 85, speed: 125, detectionRange: 340, disengageRange: 585,
    attackRange: 52, attackRadius: 39, windupSeconds: 0.42,
    recoverySeconds: 0.85, attackDamage: 11,
  },
};

export interface EnemyAgent extends Enemy {
  kind: EnemyKind;
  /** Overrides for seeded Warden variants and elite enemies. */
  profile?: Readonly<EnemyArchetype>;
  aggro: boolean;
  phase: EnemyPhase;
  phaseRemaining: number;
  /** Locked world position: changing direction can dodge the attack. */
  attackTarget: Point | null;
  path: Point[];
  repathTimer: number;
}

export interface EnemyStrike {
  enemyId: number;
  kind: EnemyKind;
  center: Point;
  radius: number;
  damage: number;
  hit: boolean;
}

export function createEnemyAgent(
  enemy: Enemy, kind: EnemyKind = 'wretch',
  profile?: Readonly<EnemyArchetype>,
): EnemyAgent {
  return {
    ...enemy, position: { ...enemy.position }, kind,
    ...(profile ? { profile: { ...profile } } : {}),
    aggro: false,
    phase: 'chase', phaseRemaining: 0, attackTarget: null,
    path: [], repathTimer: 0,
  };
}

function cancelAttack(enemy: EnemyAgent): void {
  enemy.phase = 'chase';
  enemy.phaseRemaining = 0;
  enemy.attackTarget = null;
  enemy.path = [];
  enemy.repathTimer = 0;
}

/**
 * Deterministic enemy combat with a visible locked-position windup.
 * An attack only deals damage at windup completion, and only if the player
 * remains inside its marked circle with an unobstructed line of sight.
 * The scene reads enemy.phase/attackTarget to draw telegraph indicators.
 */
export function updateEnemyAgents(
  agents: EnemyAgent[],
  player: Point,
  grid: NavigationGrid,
  deltaSeconds: number,
): EnemyStrike[] {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return [];
  const step = Math.min(deltaSeconds, 0.05);
  const strikes: EnemyStrike[] = [];

  for (const enemy of agents) {
    if (enemy.hp <= 0) {
      cancelAttack(enemy);
      enemy.aggro = false;
      continue;
    }

    const stats = enemy.profile ?? ENEMY_ARCHETYPES[enemy.kind];
    const distance = Math.hypot(player.x - enemy.position.x, player.y - enemy.position.y);

    if (distance < stats.detectionRange) enemy.aggro = true;
    if (distance > stats.disengageRange) {
      enemy.aggro = false;
      cancelAttack(enemy);
      continue;
    }
    if (!enemy.aggro) continue;

    if (enemy.phase === 'windup') {
      enemy.phaseRemaining = Math.max(0, enemy.phaseRemaining - step);
      if (enemy.phaseRemaining > 0.000001) continue;

      const center = enemy.attackTarget;
      if (center) {
        const hit = Math.hypot(player.x - center.x, player.y - center.y) <= stats.attackRadius &&
          grid.isSegmentWalkable(enemy.position, player) &&
          grid.isSegmentWalkable(enemy.position, center);
        strikes.push({
          enemyId: enemy.id,
          kind: enemy.kind,
          center: { ...center },
          radius: stats.attackRadius,
          damage: stats.attackDamage,
          hit,
        });
      }
      enemy.attackTarget = null;
      enemy.phase = 'recovery';
      enemy.phaseRemaining = stats.recoverySeconds;
      continue;
    }

    if (enemy.phase === 'recovery') {
      enemy.phaseRemaining = Math.max(0, enemy.phaseRemaining - step);
      if (enemy.phaseRemaining > 0) continue;
      enemy.phase = 'chase';
    }

    if (distance <= stats.attackRange && grid.isSegmentWalkable(enemy.position, player)) {
      enemy.phase = 'windup';
      enemy.phaseRemaining = stats.windupSeconds;
      enemy.attackTarget = { ...player };
      enemy.path = [];
      continue;
    }

    enemy.repathTimer -= step;
    if (enemy.repathTimer <= 0 || enemy.path.length === 0) {
      enemy.path = findPath(grid, enemy.position, player) ?? [];
      enemy.repathTimer = 0.35;
    }
    if (enemy.path.length === 0) continue;

    const target = enemy.path[0];
    const dx = target.x - enemy.position.x;
    const dy = target.y - enemy.position.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.01) {
      enemy.path.shift();
      continue;
    }

    const travel = Math.min(length, stats.speed * step);
    const next = {
      x: enemy.position.x + dx / length * travel,
      y: enemy.position.y + dy / length * travel,
    };
    if (grid.isSegmentWalkable(enemy.position, next)) enemy.position = next;
    else {
      enemy.path = [];
      enemy.repathTimer = 0;
      continue;
    }
    if (travel >= length - 0.01) enemy.path.shift();
  }
  return strikes;
}
