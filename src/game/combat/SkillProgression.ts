import { ACTIVE_SKILLS, CINDER_BURST, SKILL_SUPPORTS, skillPatternLabel } from './AutoSkillSystem';

export type RewardSource = 'cache' | 'warden' | `cache:${number}` | `warden:${number}`;

/** Each floor offers its own Cache and Warden reward without duplicating depth 1 IDs. */
export function rewardSourceAtDepth(source: 'cache' | 'warden', depth: number): RewardSource {
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > 1000) {
    throw new Error('Invalid reward depth');
  }
  return depth === 1 ? source : `${source}:${depth}`;
}

export interface UnlockChoice {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly kind: 'skill' | 'support' | 'forge';
}

export const UNLOCK_CHOICES: readonly UnlockChoice[] = [
  ...ACTIVE_SKILLS.filter(skill => skill.id !== CINDER_BURST.id).map(skill => ({
    id: `skill:${skill.id}`, label: skill.name,
    description: `${skill.type.toUpperCase()} · ${skill.type === 'attack' ? 'Attack Power' : 'Spell Power'} scaling · New auto-casting skill · ${skill.damage} damage · ${skillPatternLabel(skill, skill.radius)} · ${skill.cooldownSeconds}s cooldown`,
    kind: 'skill' as const,
  })),
  ...SKILL_SUPPORTS.map(support => ({
    id: `support:${support.id}`, label: support.name,
    description: support.description, kind: 'support' as const,
  })),
];
/** Repeatable extraction loot: spend at camp to reroll one secured gear affix. */
export const FORGE_EMBER_CHOICE: UnlockChoice = {
  id: 'forge:ember',
  label: 'Forge Ember',
  description: 'REPEATABLE · Secure one Forge Ember on extraction; at camp, reroll one affix on stored magic or rare gear. 25% affix loss, 20% inverted penalty, 55% reroll. One lifetime attempt per item; forge only after extracting and starting your next expedition.',
  kind: 'forge',
};

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
  private pendingEmbers = 0;
  private readonly offered = new Set<RewardSource>();
  private readonly resolved = new Set<RewardSource>();

  constructor(unlocked: readonly string[] = []) {
    this.unlocked = new Set(unlocked.filter(isValidUnlockId));
  }

  get secured(): readonly string[] { return [...this.unlocked]; }
  get pendingUnlocks(): readonly string[] { return [...this.chosen]; }
  get pendingForgeEmbers(): number { return this.pendingEmbers; }
  get rewardChoices(): readonly UnlockChoice[] { return [...this.availableChoices, FORGE_EMBER_CHOICE]; }
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
    if (this.offered.has(source) || this.resolved.has(source)) return false;
    this.offered.add(source);
    return true;
  }

  choose(source: RewardSource, id: string): boolean {
    if (!this.offered.has(source) || this.resolved.has(source)) return false;
    if (id === FORGE_EMBER_CHOICE.id) {
      this.resolved.add(source);
      this.pendingEmbers++;
      return true;
    }
    if (!this.availableChoices.some(choice => choice.id === id)) return false;
    this.resolved.add(source);
    this.chosen.add(id);
    return true;
  }
}
