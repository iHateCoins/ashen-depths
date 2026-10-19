import type { Point } from '../movement/MovementController';
import type { DungeonLayout, DungeonRoom } from './DungeonGenerator';

export const EXTRACTION_RADIUS = 78;
export const EXTRACTION_SECONDS = 2.5;

export interface ExtractionSite {
  readonly id: string;
  readonly label: string;
  readonly roomId: number;
  readonly position: Point;
}
export type ExtractionPhase = 'idle' | 'channeling' | 'completed';
export type ExtractionTick = 'idle' | 'channeling' | 'interrupted' | 'completed';

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roomPoint(room: DungeonRoom, layout: DungeonLayout): Point {
  return {
    x: (room.center.x + 0.5) * layout.cellSize,
    y: (room.center.y + 0.5) * layout.cellSize,
  };
}

function insideRoom(room: DungeonRoom, position: Point, size: number): boolean {
  const x = Math.floor(position.x / size);
  const y = Math.floor(position.y / size);
  return x >= room.x && x < room.x + room.width &&
    y >= room.y && y < room.y + room.height;
}

/**
 * Select two ordinary optional chambers as extraction points.
 *
 * They are never in the entrance, guarded cache or Warden chamber. Choosing
 * separated rooms gives players different retreat routes in the same
 * continuous maze. Deterministic room geometry makes their positions
 * reproducible without adding new procedural geometry.
 */
export function planExtractionSites(layout: DungeonLayout): readonly ExtractionSite[] {
  const entrance = layout.rooms.find(room => room.role === 'entrance');
  const chambers = layout.rooms.filter(room => room.role === 'chamber');
  if (!entrance || chambers.length < 2) {
    throw new Error('Extraction requires an entrance and two ordinary chambers');
  }
  const center = roomPoint(entrance, layout);
  // First exit is relatively accessible. The second is more remote and
  // geographically separated, rewarding players who venture farther in.
  const ranked = [...chambers].sort((a, b) =>
    distance(roomPoint(a, layout), center) - distance(roomPoint(b, layout), center) || a.id - b.id
  );
  const first = ranked[1] ?? ranked[0]; // Not the entrance-adjacent shrine's usual chamber.
  const second = [...chambers].filter(room =>
    room.id !== first.id && room.id !== ranked[0].id)
    .sort((a, b) =>
      distance(roomPoint(b, layout), roomPoint(first, layout)) -
      distance(roomPoint(a, layout), roomPoint(first, layout)) || a.id - b.id
    )[0];

  return [
    { id: 'waystone-near', label: 'Waystone of Return', roomId: first.id,
      position: roomPoint(first, layout) },
    { id: 'waystone-far', label: 'Distant Waystone', roomId: second.id,
      position: roomPoint(second, layout) },
  ];
}

/**
 * A conscious escape decision, never auto-triggered by entering a room.
 * A short channel gives nearby monsters time to interrupt the retreat.
 *
 * Damage, leaving the radius, opening the bag, or dying interrupts. Enemies
 * need not be killed; simply escaping without taking a hit is enough.
 * Saving items happens outside this class and ONLY after a completed channel.
 */
export class ExtractionDirector {
  readonly sites: readonly ExtractionSite[];
  private activeSite: ExtractionSite | null = null;
  private progress = 0;
  private finished = false;

  constructor(private readonly layout: DungeonLayout) {
    this.sites = planExtractionSites(layout);
  }

  get phase(): ExtractionPhase {
    return this.finished ? 'completed' : this.activeSite ? 'channeling' : 'idle';
  }

  get site(): ExtractionSite | null { return this.activeSite; }
  get elapsed(): number { return this.progress; }
  get remaining(): number { return Math.max(0, EXTRACTION_SECONDS - this.progress); }

  nearby(position: Point): ExtractionSite | null {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
    for (const site of this.sites) {
      const room = this.layout.rooms.find(candidate => candidate.id === site.roomId)!;
      if (insideRoom(room, position, this.layout.cellSize) &&
          distance(site.position, position) <= EXTRACTION_RADIUS) return site;
    }
    return null;
  }

  start(siteId: string, player: Point): boolean {
    if (this.finished || this.activeSite) return false;
    const site = this.nearby(player);
    if (!site || site.id !== siteId) return false;
    this.activeSite = site;
    this.progress = 0;
    return true;
  }

  cancel(): void {
    if (!this.finished) {
      this.activeSite = null;
      this.progress = 0;
    }
  }

  /** A failed persistent write cannot trap the player in a completed exit. */
  resetAfterSaveFailure(): void {
    this.finished = false;
    this.activeSite = null;
    this.progress = 0;
  }

  update(deltaSeconds: number, player: Point, damaged: boolean, defeated: boolean): ExtractionTick {
    if (this.finished) return 'completed';
    if (!this.activeSite) return 'idle';
    if (damaged || defeated || this.nearby(player)?.id !== this.activeSite.id) {
      this.cancel();
      return 'interrupted';
    }
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error('Extraction delta must be finite and non-negative');
    }
    this.progress += deltaSeconds;
    if (this.progress >= EXTRACTION_SECONDS) {
      this.finished = true;
      return 'completed';
    }
    return 'channeling';
  }
}
