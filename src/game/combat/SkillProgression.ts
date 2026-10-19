import { ACTIVE_SKILLS, CINDER_BURST, SKILL_SUPPORTS } from './AutoSkillSystem';

export type RewardSource = 'cache' | 'warden';

export interface UnlockChoice {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly kind: 'skill' | 'support';
}

export const UNLOCK_CHOICES: readonly UnlockChoice[] = [
  ...ACTIVE_SKILLS.filter(skill => skill.id !== CINDER_BURST.id).map(skill => ({
    id: `skill:${skill.id}`, label: skill.name,
    description: `${skill.type.toUpperCase()} · ${skill.type === 'attack' ? 'Attack Power' : 'Spell Power'} scaling · New auto-casting skill · ${skill.damage} damage · ${skill.cooldownSeconds}s cooldown`,
    kind: 'skill' as const,
  })),
  ...SKILL_SUPPORTS.map(support => ({
    id: `support:${support.id}`, label: support.name,
    description: support.description, kind: 'support' as const,
  })),
];
const KNOWN = new Set(UNLOCK_CHOICES.map(choice => choice.id));
export const isValidUnlockId = (id: unknown): id is string =>
  typeof id === 'string' && KNOWN.has(id);

/**
 * Reward choices are unsecured expedition discoveries until successful exit.
 * An opened cache and a defeated Warden each offer at most one choice.
 * The choice is kept in run state; the stash stores it only alongside secured
 * gear on extraction. Death/restart discards every pending unlock.
 */
export class SkillProgression {
  private readonly unlocked: Set<string>;
  private readonly chosen = new Set<string>();
  private readonly offered = new Set<RewardSource>();
  private readonly resolved = new Set<RewardSource>();

  constructor(unlocked: readonly string[] = []) {
    this.unlocked = new Set(unlocked.filter(isValidUnlockId));
  }

  get secured(): readonly string[] { return [...this.unlocked]; }
  get pendingUnlocks(): readonly string[] { return [...this.chosen]; }
  get choicesRemaining(): readonly RewardSource[] {
    return [...this.offered].filter(source => !this.resolved.has(source));
  }
  get availableChoices(): readonly UnlockChoice[] {
    return UNLOCK_CHOICES.filter(item => !this.unlocked.has(item.id) && !this.chosen.has(item.id));
  }
  get allLearned(): boolean { return this.availableChoices.length === 0 && this.chosen.size === 0; }
  canUseSkill(id: string): boolean { return id === CINDER_BURST.id || this.unlocked.has(`skill:${id}`); }
  canUseSupport(id: string): boolean { return this.unlocked.has(`support:${id}`); }
  isSecured(id: string): boolean { return this.unlocked.has(id); }
  isPending(id: string): boolean { return this.chosen.has(id); }

  /** Discovering a reward never automatically grants or persists an unlock. */
  offer(source: RewardSource): boolean {
    if (this.offered.has(source) || this.resolved.has(source) || !this.availableChoices.length) return false;
    this.offered.add(source);
    return true;
  }

  choose(source: RewardSource, id: string): boolean {
    if (!this.offered.has(source) || this.resolved.has(source) ||
        !this.availableChoices.some(choice => choice.id === id)) return false;
    this.resolved.add(source);
    this.chosen.add(id);
    return true;
  }
}
