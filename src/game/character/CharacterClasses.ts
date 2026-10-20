import { CINDER_BURST, CRESCENT_CLEAVE, type AutoSkillDefinition } from '../combat/AutoSkillSystem';

export type CharacterClassId = 'vanguard' | 'arcanist';

export interface CharacterClassDefinition {
  readonly id: CharacterClassId;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly health: number;
  readonly basicRange: number;
  readonly basicDamage: number;
  readonly basicInterval: number;
  readonly startingSkill: AutoSkillDefinition;
}

export const CHARACTER_CLASSES: Readonly<Record<CharacterClassId, CharacterClassDefinition>> = {
  vanguard: {
    id: 'vanguard', name: 'Vanguard', tagline: 'Close combat · Toughness · Attack Power',
    description: 'A resilient melee combatant with more health and a heavier, shorter-range basic attack. Begins with the auto-casting Crescent Cleave.',
    health: 120, basicRange: 165, basicDamage: 30, basicInterval: 0.8,
    startingSkill: CRESCENT_CLEAVE,
  },
  arcanist: {
    id: 'arcanist', name: 'Arcanist', tagline: 'Spells · Reach · Positioning',
    description: 'A long-range spellcaster with automatic Cinder Burst. Relies on spacing and magical equipment rather than extra health.',
    // Preserves pre-M07 baseline combat for all existing saves and regressions.
    health: 100, basicRange: 250, basicDamage: 25, basicInterval: 0.7,
    startingSkill: CINDER_BURST,
  },
} as const;

export const DEFAULT_CHARACTER_CLASS: CharacterClassId = 'arcanist';

export function isCharacterClassId(value: unknown): value is CharacterClassId {
  return value === 'arcanist' || value === 'vanguard';
}
