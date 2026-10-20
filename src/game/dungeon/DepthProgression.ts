import { lootHash } from '../loot/ExpeditionLoot';

export const STARTING_DEPTH = 1;

/** Floors use independent deterministic layouts and drop IDs in one expedition. */
export function seedForDepth(expeditionSeed: number, depth: number): number {
  if (!Number.isSafeInteger(depth) || depth < STARTING_DEPTH || depth > 497) {
    throw new Error('Depth must be an integer between 1 and 497');
  }
  return depth === STARTING_DEPTH ? expeditionSeed >>> 0
    : lootHash(expeditionSeed >>> 0, depth, 0xD3E7);
}

/** A Warden kill, not a waypoint or a visited chamber, gates each descent. */
export function canDescend(depth: number, wardenDefeated: boolean, defeated: boolean): boolean {
  return Number.isSafeInteger(depth) && depth >= STARTING_DEPTH &&
    depth < 497 && wardenDefeated && !defeated;
}

/** The actual Warden kill event (not depth entry) is required to earn a point. */
export function isPassiveMilestone(depth: number, wardenDefeated: boolean): boolean {
  return Number.isSafeInteger(depth) && depth >= 2 && depth <= 496 && depth % 2 === 0 && wardenDefeated;
}
