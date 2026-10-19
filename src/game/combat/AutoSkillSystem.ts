import type { Point } from '../movement/MovementController';
import type { Enemy } from './AutoCombat';

export interface AutoSkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly range: number;
  readonly radius: number;
  readonly damage: number;
  readonly cooldownSeconds: number;
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
  hits: SkillHit[];
}

export type LineOfSight = (from: Point, to: Point) => boolean;

export const CINDER_BURST: AutoSkillDefinition = {
  id: 'cinder-burst',
  name: 'Cinder Burst',
  range: 250,
  radius: 105,
  damage: 35,
  cooldownSeconds: 4,
};

export const SKILL_SLOT_LIMIT = 2;

export const FROST_BLOOM: AutoSkillDefinition = {
  id: 'frost-bloom', name: 'Frost Bloom', range: 170, radius: 140,
  damage: 20, cooldownSeconds: 6,
};

export const ASH_LANCE: AutoSkillDefinition = {
  id: 'ash-lance', name: 'Ash Lance', range: 320, radius: 28,
  damage: 65, cooldownSeconds: 3.5,
};

export const ACTIVE_SKILLS: readonly AutoSkillDefinition[] = [CINDER_BURST, FROST_BLOOM, ASH_LANCE];

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
  /** Additive damage granted by worn equipment, never manually cast. */
  bonusDamage = 0;
  private equippedSkills: AutoSkillDefinition[];
  get equipped(): readonly AutoSkillDefinition[] { return [...this.equippedSkills]; }

  /** Change loadout without refreshing the scene. Newly slotted skills begin ready. */
  setEquipped(equipped: readonly AutoSkillDefinition[]): void {
    if (equipped.length > SKILL_SLOT_LIMIT) throw new Error('Active skill slots full');
    const ids = new Set<string>();
    for (const skill of equipped) {
      if (ids.has(skill.id)) throw new Error(`Duplicate active skill: ${skill.id}`);
      if (!(skill.range > 0 && skill.radius > 0 && skill.damage > 0 && skill.cooldownSeconds > 0)) {
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
      supportId: support?.id ?? null,
      damage: Math.max(1, Math.round((skill.damage + this.bonusDamage) * (support?.damageMultiplier ?? 1))),
      radius: Math.max(1, Math.round(skill.radius * (support?.radiusMultiplier ?? 1))),
      range: skill.range,
      cooldownSeconds: Math.round(skill.cooldownSeconds * (support?.cooldownMultiplier ?? 1) * 100) / 100,
    };
  }

  remaining(skillId: string): number {
    return this.cooldowns.get(skillId) ?? 0;
  }

  update(player: Point, enemies: Enemy[], deltaSeconds: number, clear: LineOfSight = () => true): SkillCast[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return [];
    const step = Math.min(deltaSeconds, 0.1);
    const casts: SkillCast[] = [];

    for (const skill of this.equipped) {
      const stats = this.effectiveStats(skill.id);
      const elapsed = Math.max(0, this.remaining(skill.id) - step);
      const remaining = elapsed < 1e-8 ? 0 : elapsed;
      this.cooldowns.set(skill.id, remaining);
      if (remaining > 0) continue;

      // Prefer clusters, then shorter distance, then stable enemy ID.
      // This makes an area skill useful without manual targeting.
      let best: Enemy | null = null;
      let bestCount = -1;
      let bestDistance = Infinity;
      for (const enemy of enemies) {
        if (enemy.hp <= 0) continue;
        const distance = Math.hypot(enemy.position.x - player.x, enemy.position.y - player.y);
        if (distance > stats.range || !clear(player, enemy.position)) continue;

        let count = 0;
        for (const nearby of enemies) {
          if (nearby.hp > 0 &&
              Math.hypot(nearby.position.x - enemy.position.x, nearby.position.y - enemy.position.y) <= stats.radius &&
              clear(enemy.position, nearby.position)) count++;
        }

        if (count > bestCount ||
            (count === bestCount && (distance < bestDistance ||
              (distance === bestDistance && enemy.id < (best?.id ?? Infinity))))) {
          best = enemy;
          bestCount = count;
          bestDistance = distance;
        }
      }
      if (!best) continue;

      const center = { ...best.position };
      const hits: SkillHit[] = [];
      for (const enemy of enemies) {
        if (enemy.hp <= 0) continue;
        if (Math.hypot(enemy.position.x - center.x, enemy.position.y - center.y) > stats.radius ||
            !clear(center, enemy.position)) continue;
        const damage = stats.damage;
        enemy.hp = Math.max(0, enemy.hp - damage);
        hits.push({ enemyId: enemy.id, damage });
      }
      this.cooldowns.set(skill.id, stats.cooldownSeconds);
      casts.push({ skillId: skill.id, targetId: best.id, center, radius: stats.radius, hits });
    }
    return casts;
  }
}
