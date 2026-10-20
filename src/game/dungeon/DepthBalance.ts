/**
 * M07 balance contract. The first sixteen floors preserve the earlier M07
 * encounter tuning exactly; after that, monsters keep pace with continuously
 * scaling item levels rather than becoming permanently capped opponents.
 *
 * These functions never modify items, drops, saves, passive milestones, or
 * the player's maximum HP. They are deterministic for a given floor number.
 */
export const MAX_EXPEDITION_DEPTH = 497;

function assertDepth(depth: number): void {
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > MAX_EXPEDITION_DEPTH) {
    throw new Error('Depth must be an integer between 1 and 497');
  }
}

export function enemyHealthMultiplier(depth: number): number {
  assertDepth(depth);
  // Matches M07 PR01-05 through floor 16 (1x on Depth 1, 3.7x on 16).
  // Continue this stable curve after 16 rather than freezing difficulty.
  return 1 + (depth - 1) * 0.18;
}

export function enemyStrikeDepthBonus(depth: number): number {
  assertDepth(depth);
  // Preserve the original +2 per floor up to +30 at Depth 16. Afterwards,
  // +1 per floor offsets increasing armor on high-level drops and keeps a
  // reason to extract without making an unarmored class instantly obsolete.
  return Math.min(30, (depth - 1) * 2) + Math.max(0, depth - 16);
}

export type DungeonThreat = "Warden's Reach" | 'Deep Peril' | 'Abyssal';
export function threatAtDepth(depth: number): DungeonThreat {
  assertDepth(depth);
  if (depth < 3) return "Warden's Reach";
  return depth < 9 ? 'Deep Peril' : 'Abyssal';
}
