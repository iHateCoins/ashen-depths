import type { CharacterClassId } from './CharacterClasses';
import { isPassiveMilestone } from '../dungeon/DepthProgression';

/** Valid M07 depth-2,4,6... Warden milestones within the current floor cap. */
export function validPassiveDepth(depth: unknown): depth is number {
  return typeof depth === 'number' && Number.isSafeInteger(depth) &&
    depth >= 2 && depth <= 496 && depth % 2 === 0;
}

export type PassiveMilestoneLedger = Partial<Record<CharacterClassId, number[]>>;

export function validPassiveLedger(value: unknown): value is PassiveMilestoneLedger {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some(key => key !== 'vanguard' && key !== 'arcanist')) return false;
  return Object.values(candidate).every(depths =>
    Array.isArray(depths) && depths.length <= 248 &&
    depths.every(validPassiveDepth) && new Set(depths).size === depths.length &&
    depths.every((depth, index) => index === 0 || depths[index - 1] < depth));
}

export function clonePassiveLedger(ledger: PassiveMilestoneLedger): PassiveMilestoneLedger {
  return {
    ...(ledger.vanguard !== undefined ? { vanguard: [...ledger.vanguard] } : {}),
    ...(ledger.arcanist !== undefined ? { arcanist: [...ledger.arcanist] } : {}),
  };
}

/**
 * A point is not earned by merely reaching or entering the next floor.
 * It becomes at-risk only after the corresponding even-floor Warden is killed.
 * Extracting secures only previously unbanked milestones; repeat kills give no
 * points. The selected class is fixed across each risky expedition.
 */
export class PassiveMilestoneProgress {
  private currentClass: CharacterClassId;
  private banked: Set<number>;
  private readonly pending = new Set<number>();

  constructor(classId: CharacterClassId, banked: readonly number[] = []) {
    if (banked.some(depth => !validPassiveDepth(depth))) {
      throw new Error('Invalid secured passive milestone');
    }
    this.currentClass = classId;
    this.banked = new Set(banked);
  }

  get characterClass(): CharacterClassId { return this.currentClass; }
  get bankedDepths(): readonly number[] { return [...this.banked].sort((a,b) => a-b); }
  get pendingDepths(): readonly number[] { return [...this.pending].sort((a,b) => a-b); }
  get bankedPoints(): number { return this.banked.size; }
  get pendingPoints(): number { return this.pending.size; }

  /** Return true only for the first eligible Warden kill for this class. */
  defeatWarden(depth: number, wardenDefeated: boolean): boolean {
    if (!validPassiveDepth(depth) || !isPassiveMilestone(depth, wardenDefeated) ||
        this.banked.has(depth) || this.pending.has(depth)) return false;
    this.pending.add(depth);
    return true;
  }

  /** Entrance-camp class changes reload that class's secured milestones. */
  selectClass(classId: CharacterClassId, banked: readonly number[]): boolean {
    if (this.pending.size) return false;
    if (banked.some(depth => !validPassiveDepth(depth))) return false;
    this.currentClass = classId;
    this.banked = new Set(banked);
    return true;
  }
}
