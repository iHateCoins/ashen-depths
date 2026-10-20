import { lootHash } from '../loot/ExpeditionLoot';

export const STARTING_DEPTH = 1;

/** Floors use independent deterministic layouts and drop IDs in one expedition. */
export function seedForDepth(expeditionSeed: number, depth: number): number {
  if (!Number.isSafeInteger(depth) || depth < STARTING_DEPTH || depth > 1000) {
    throw new Error('Depth must be an integer between 1 and 1000');
  }
  return depth === STARTING_DEPTH ? expeditionSeed >>> 0
    : lootHash(expeditionSeed >>> 0, depth, 0xD3E7);
}

/** A Warden kill, not a waypoint or a visited chamber, gates each descent. */
export function canDescend(depth: number, wardenDefeated: boolean, defeated: boolean): boolean {
  return Number.isSafeInteger(depth) && depth >= STARTING_DEPTH &&
    depth < 1000 && wardenDefeated && !defeated;
}

/** M07 PR02 will secure one point per previously unclaimed even depth Warden. */
export function isPassiveMilestone(depth: number, wardenDefeated: boolean): boolean {
  return Number.isSafeInteger(depth) && depth >= 2 && depth % 2 === 0 && wardenDefeated;
}
