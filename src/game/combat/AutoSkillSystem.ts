import type { Point } from '../movement/MovementController';
import type { Enemy } from './AutoCombat';

export type SkillDamageType = 'attack' | 'spell';
/** Area blasts, piercing lines and capped enemy-to-enemy chains. */
export type SkillPattern = 'area' | 'pierce' | 'chain';

export function skillPatternLabel(skill: AutoSkillDefinition, radius: number): string {
  const pattern = skill.pattern ?? 'area';
  if (pattern === 'pierce') return `${radius}px half-width · pierces enemies`;
  if (pattern === 'chain') return `${radius}px jump range · up to ${skill.maxTargets ?? 3} foes`;
  return `${radius}px area`;
}

export interface AutoSkillDefinition {
  /** Determines which equipped item bonuses increase the skill damage. */
  readonly type: SkillDamageType;
  readonly id: string;
  readonly name: string;
  readonly range: number;
  readonly radius: number;
  readonly damage: number;
  readonly cooldownSeconds: number;
  readonly pattern?: SkillPattern;
  /** Only meaningful for chain-pattern skills. */
  readonly maxTargets?: number;
}

export interface SkillHit {
  enemyId: number;
  damage: number;
}

export interface SkillCast {
  skillId: string;
  targetId: number;
  center: Point;
  radius: number;
  /** Used by the scene to draw a line or chain rather than an AoE disk. */
  pattern: SkillPattern;
  path?: Point[];
  hits: SkillHit[];
}

export type LineOfSight = (from: Point, to: Point) => boolean;

export const CINDER_BURST: AutoSkillDefinition = {
  id: 'cinder-burst',
  name: 'Cinder Burst',
  type: 'spell',
  range: 250,
  radius: 105,
  damage: 35,
  cooldownSeconds: 4,
};

export const SKILL_SLOT_LIMIT = 2;

export const FROST_BLOOM: AutoSkillDefinition = {
  id: 'frost-bloom', name: 'Frost Bloom', type: 'spell', range: 170, radius: 140,
  damage: 20, cooldownSeconds: 6,
};

export const ASH_LANCE: AutoSkillDefinition = {
  id: 'ash-lance', name: 'Ash Lance', type: 'spell', range: 320, radius: 28,
  damage: 65, cooldownSeconds: 3.5,
};

/** A short-range physical attack that rewards weapon and Sharp-affix equipment. */
export const CRESCENT_CLEAVE: AutoSkillDefinition = {
  id: 'crescent-cleave', name: 'Crescent Cleave', type: 'attack',
  range: 165, radius: 90, damage: 45, cooldownSeconds: 3.6,
};

/** Physical piercing volley: enemies behind the target can also be hit. */
export const PIERCING_VOLLEY: AutoSkillDefinition = {
  id: 'piercing-volley', name: 'Piercing Volley', type: 'attack',
  pattern: 'pierce', range: 280, radius: 28,
  damage: 38, cooldownSeconds: 3.8,
};

/** Magical lightning arc: jumps at most three times, losing 20% per hop. */
export const ARC_RELAY: AutoSkillDefinition = {
  id: 'arc-relay', name: 'Arc Relay', type: 'spell',
  pattern: 'chain', maxTargets: 3, range: 270, radius: 155,
  damage: 45, cooldownSeconds: 5.2,
};

export const ACTIVE_SKILLS: readonly AutoSkillDefinition[] = [
  CINDER_BURST, FROST_BLOOM, ASH_LANCE, CRESCENT_CLEAVE,
  PIERCING_VOLLEY, ARC_RELAY,
];

/**
 * Each support is a trade-off, not a free upgrade. At most one support is
 * attached to each equipped active skill, and each prototype support may be
 * attached to only one skill in the loadout.
 */
export interface SkillSupportDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly damageMultiplier: number;
  readonly radiusMultiplier: number;
  readonly cooldownMultiplier: number;
}

export const SKILL_SUPPORTS: readonly SkillSupportDefinition[] = [
  {
    id: 'focused-power',
    name: 'Focused Power',
    description: '+35% damage, -25% area',
    damageMultiplier: 1.35, radiusMultiplier: 0.75, cooldownMultiplier: 1,
  },
  {
    id: 'expansive-blast',
    name: 'Expansive Blast',
    description: '+50% area, -20% damage',
    damageMultiplier: 0.8, radiusMultiplier: 1.5, cooldownMultiplier: 1,
  },
  {
    id: 'swift-casting',
    name: 'Swift Casting',
    description: '-30% cooldown, -20% damage',
    damageMultiplier: 0.8, radiusMultiplier: 1, cooldownMultiplier: 0.7,
  },
];

export interface EffectiveSkillStats {
  readonly skillId: string;
  readonly type: SkillDamageType;
  readonly supportId: string | null;
  readonly damage: number;
  readonly radius: number;
  readonly range: number;
  readonly cooldownSeconds: number;
}

/**
 * Skill logic is framework-independent. The scene owns presentation;
 * equipped skills only return casts and mutate enemy HP.
 */
export class AutoSkillSystem {
  private cooldowns = new Map<string, number>();
  private supports = new Map<string, string>();
  /** Spell Power from equipment scales spells only. */
  bonusDamage = 0;
  /** Attack Power from equipment scales attack-tagged skills only. */
  bonusAttackDamage = 0;
  private equippedSkills: AutoSkillDefinition[];
  get equipped(): readonly AutoSkillDefinition[] { return [...this.equippedSkills]; }

  /** Change loadout without refreshing the scene. Newly slotted skills begin ready. */
  setEquipped(equipped: readonly AutoSkillDefinition[]): void {
    if (equipped.length > SKILL_SLOT_LIMIT) throw new Error('Active skill slots full');
    const ids = new Set<string>();
    for (const skill of equipped) {
      if (ids.has(skill.id)) throw new Error(`Duplicate active skill: ${skill.id}`);
      if (!['attack', 'spell'].includes(skill.type) ||
          (skill.pattern !== undefined && !(['area','pierce','chain'] as string[]).includes(skill.pattern)) ||
          (skill.maxTargets !== undefined && (!Number.isInteger(skill.maxTargets) ||
            skill.maxTargets < 1 || skill.maxTargets > 8)) ||
          !(skill.range > 0 && skill.radius > 0 && skill.damage > 0 && skill.cooldownSeconds > 0)) {
        throw new Error(`Invalid auto skill definition: ${skill.id}`);
      }
      ids.add(skill.id);
    }
    // Retain cooldowns when a skill is temporarily removed. Re-equipping it
    // must not provide an instant cast by resetting a previously used skill.
    for (const id of ids) if (!this.cooldowns.has(id)) this.cooldowns.set(id, 0);
    for (const id of this.supports.keys()) if (!ids.has(id)) this.supports.delete(id);
    this.equippedSkills = [...equipped];
  }

  constructor(equipped: readonly AutoSkillDefinition[] = [CINDER_BURST]) {
    this.equippedSkills = [];
    this.setEquipped(equipped);
  }

  supportFor(skillId: string): SkillSupportDefinition | null {
    const id = this.supports.get(skillId);
    return SKILL_SUPPORTS.find(support => support.id === id) ?? null;
  }

  /** Validate the whole support assignment before mutating it. */
  setSupport(skillId: string, supportId: string | null): void {
    if (!this.equippedSkills.some(skill => skill.id === skillId)) {
      throw new Error(`Skill is not equipped: ${skillId}`);
    }
    if (supportId !== null) {
      if (!SKILL_SUPPORTS.some(support => support.id === supportId)) {
        throw new Error(`Unknown support: ${supportId}`);
      }
      if ([...this.supports].some(([owner, id]) => owner !== skillId && id === supportId)) {
        throw new Error(`Support already equipped: ${supportId}`);
      }
      this.supports.set(skillId, supportId);
    } else {
      this.supports.delete(skillId);
    }
    // Changing supports never clears a consumed cooldown.
  }

  effectiveStats(skillId: string): EffectiveSkillStats {
    const skill = this.equippedSkills.find(item => item.id === skillId);
    if (!skill) throw new Error(`Skill is not equipped: ${skillId}`);
    const support = this.supportFor(skillId);
    return {
      skillId,
      type: skill.type,
      supportId: support?.id ?? null,
      damage: Math.max(1, Math.round((skill.damage + (skill.type === 'attack'
        ? this.bonusAttackDamage : this.bonusDamage)) * (support?.damageMultiplier ?? 1))),
      radius: Math.max(1, Math.round(skill.radius * (support?.radiusMultiplier ?? 1))),
      range: skill.range,
      cooldownSeconds: Math.round(skill.cooldownSeconds * (support?.cooldownMultiplier ?? 1) * 100) / 100,
    };
  }

  remaining(skillId: string): number {
    return this.cooldowns.get(skillId) ?? 0;
  }

  /**
   * Deterministic automatic targeting: favor most potential hits, then nearest
   * primary, then stable enemy ID. All patterns obey line-of-sight.
   */
  update(player: Point, enemies: Enemy[], deltaSeconds: number, clear: LineOfSight = () => true): SkillCast[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return [];
    const step = Math.min(deltaSeconds, 0.1);
    const casts: SkillCast[] = [];

    for (const skill of this.equipped) {
      const stats = this.effectiveStats(skill.id);
      const pattern = skill.pattern ?? 'area';
      const elapsed = Math.max(0, this.remaining(skill.id) - step);
      const remaining = elapsed < 1e-8 ? 0 : elapsed;
      this.cooldowns.set(skill.id, remaining);
      if (remaining > 0) continue;

      const eligible = enemies.filter(enemy => enemy.hp > 0 &&
        Math.hypot(enemy.position.x - player.x, enemy.position.y - player.y) <= stats.range &&
        clear(player, enemy.position));

      let primary: Enemy | null = null;
      let chosen: Enemy[] = [];
      let bestDistance = Infinity;
      for (const enemy of eligible) {
        const distance = Math.hypot(enemy.position.x - player.x, enemy.position.y - player.y);
        const targets = pattern === 'pierce'
          ? this.piercingTargets(player, enemy.position, stats.range, stats.radius, enemies, clear)
          : pattern === 'chain'
            ? this.chainTargets(enemy, enemies, stats.radius, skill.maxTargets ?? 3, clear)
            : enemies.filter(other => other.hp > 0 &&
              Math.hypot(other.position.x - enemy.position.x,
                other.position.y - enemy.position.y) <= stats.radius &&
              clear(enemy.position, other.position));
        if (targets.length > chosen.length ||
            (targets.length === chosen.length && (distance < bestDistance ||
              (distance === bestDistance && enemy.id < (primary?.id ?? Infinity))))) {
          primary = enemy;
          chosen = targets;
          bestDistance = distance;
        }
      }
      if (!primary) continue;
      const center = { ...primary.position };
      const hits: SkillHit[] = [];
      for (const [index, enemy] of chosen.entries()) {
        if (enemy.hp <= 0) continue;
        // Arc Relay's later links deal 80% and 60% of the first hit.
        const damage = pattern === 'chain'
          ? Math.max(1, Math.round(stats.damage * (1 - 0.2 * index)))
          : stats.damage;
        enemy.hp = Math.max(0, enemy.hp - damage);
        hits.push({ enemyId: enemy.id, damage });
      }

      let path: Point[] | undefined;
      if (pattern === 'pierce') {
        const len = Math.hypot(center.x - player.x, center.y - player.y);
        const dx = len > 0 ? (center.x - player.x) / len : 1;
        const dy = len > 0 ? (center.y - player.y) / len : 0;
        path = [{ ...player }, {
          x: player.x + dx * stats.range, y: player.y + dy * stats.range,
        }];
      } else if (pattern === 'chain') {
        path = chosen.map(enemy => ({ ...enemy.position }));
      }
      this.cooldowns.set(skill.id, stats.cooldownSeconds);
      casts.push({
        skillId: skill.id, targetId: primary.id, center, radius: stats.radius,
        pattern, ...(path ? { path } : {}), hits,
      });
    }
    return casts;
  }

  /** A straight ray with an adjustable half-width; no through-wall damage. */
  private piercingTargets(
    origin: Point, aim: Point, range: number, width: number,
    enemies: readonly Enemy[], clear: LineOfSight,
  ): Enemy[] {
    const length = Math.hypot(aim.x - origin.x, aim.y - origin.y);
    const dx = length > 0 ? (aim.x - origin.x) / length : 1;
    const dy = length > 0 ? (aim.y - origin.y) / length : 0;
    return enemies.filter(enemy => {
      if (enemy.hp <= 0 || !clear(origin, enemy.position)) return false;
      const x = enemy.position.x - origin.x;
      const y = enemy.position.y - origin.y;
      const along = x * dx + y * dy;
      const across = Math.abs(x * dy - y * dx);
      return along >= -1e-8 && along <= range && across <= width;
    }).sort((a, b) => {
      const da = (a.position.x - origin.x) * dx + (a.position.y - origin.y) * dy;
      const db = (b.position.x - origin.x) * dx + (b.position.y - origin.y) * dy;
      return da - db || a.id - b.id;
    });
  }

  /** Never revisit a link, and never jump through walls. */
  private chainTargets(
    first: Enemy, enemies: readonly Enemy[], jumpRange: number,
    maximum: number, clear: LineOfSight,
  ): Enemy[] {
    const visited: Enemy[] = [first];
    const used = new Set([first.id]);
    while (visited.length < maximum) {
      const from = visited[visited.length - 1];
      const candidates = enemies.filter(enemy =>
        enemy.hp > 0 && !used.has(enemy.id) &&
        Math.hypot(enemy.position.x - from.position.x,
          enemy.position.y - from.position.y) <= jumpRange &&
        clear(from.position, enemy.position));
      candidates.sort((a, b) =>
        Math.hypot(a.position.x - from.position.x, a.position.y - from.position.y) -
        Math.hypot(b.position.x - from.position.x, b.position.y - from.position.y) || a.id - b.id);
      if (!candidates.length) break;
      const next = candidates[0];
      used.add(next.id);
      visited.push(next);
    }
    return visited;
  }
}
