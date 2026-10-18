import type { Point } from '../movement/MovementController';
import type { DungeonLayout, DungeonRoom } from './DungeonGenerator';
import type { RoomEncounterDirector } from '../combat/RoomEncounterDirector';

export type OptionalObjectiveKind = 'cache' | 'shrine';
export type ObjectiveAvailability = 'guarded' | 'ready' | 'healthy' | 'claimed';

export interface OptionalObjective {
  readonly id: OptionalObjectiveKind;
  readonly roomId: number;
  readonly position: Point;
  readonly label: string;
}

export interface ObjectivePrompt {
  readonly objective: OptionalObjective;
  readonly availability: ObjectiveAvailability;
  readonly remainingGuards: number;
}

export type ObjectiveReward =
  | { kind: 'ember-edge'; damageBonus: number }
  | { kind: 'sanctuary'; healAmount: number };

const INTERACTION_RANGE = 84;

/**
 * Run-only optional interactions. This is NOT a loot/inventory implementation.
 * The cache grants a temporary attack boon; a separate shrine offers healing.
 * Both are deterministic per dungeon seed, guarded against remote/repeat
 * activation, and fully optional to defeating the deep-chamber Warden.
 */
export class OptionalObjectiveDirector {
  readonly objectives: readonly OptionalObjective[];
  private readonly claimed = new Set<OptionalObjectiveKind>();

  constructor(
    private readonly dungeon: DungeonLayout,
    private readonly encounters: RoomEncounterDirector,
  ) {
    const cache = dungeon.rooms.find(room => room.role === 'cache');
    const entrance = dungeon.rooms.find(room => room.role === 'entrance');
    const chambers = dungeon.rooms.filter(room => room.role === 'chamber');
    if (!cache || !entrance || chambers.length === 0) {
      throw new Error('Optional objectives require entrance, cache, and ordinary chambers');
    }

    const distance = (room: DungeonRoom): number =>
      Math.hypot(room.center.x - entrance.center.x, room.center.y - entrance.center.y);

    // A nearby ordinary chamber offers restoration, while the harder cache
    // retains its original guarded location and rewards greater exploration.
    const shrine = [...chambers].sort((a, b) => distance(a) - distance(b) || a.id - b.id)[0];
    const point = (room: DungeonRoom): Point => ({
      x: (room.center.x + 0.5) * dungeon.cellSize,
      y: (room.center.y + 0.5) * dungeon.cellSize,
    });

    this.objectives = [
      { id: 'cache', roomId: cache.id, position: point(cache), label: 'Sealed Cache' },
      { id: 'shrine', roomId: shrine.id, position: point(shrine), label: 'Sanctuary Shrine' },
    ];
  }

  get claimedCount(): number { return this.claimed.size; }
  get totalCount(): number { return this.objectives.length; }
  hasClaimed(kind: OptionalObjectiveKind): boolean { return this.claimed.has(kind); }
  get attackBonus(): number { return this.hasClaimed('cache') ? 10 : 0; }

  /**
   * The prompt is only returned inside the objective's own chamber and within
   * touch/interaction range. Characters never interact through dungeon walls.
   */
  nearby(
    player: Point,
    enemies: readonly { id: number; hp: number }[],
    hp: number,
    maxHp: number,
  ): ObjectivePrompt | null {
    if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) return null;

    for (const objective of this.objectives) {
      const room = this.dungeon.rooms.find(item => item.id === objective.roomId)!;
      const cellX = Math.floor(player.x / this.dungeon.cellSize);
      const cellY = Math.floor(player.y / this.dungeon.cellSize);
      if (cellX < room.x || cellX >= room.x + room.width ||
          cellY < room.y || cellY >= room.y + room.height ||
          Math.hypot(player.x - objective.position.x, player.y - objective.position.y) > INTERACTION_RANGE) {
        continue;
      }
      const remainingGuards = objective.id === 'cache'
        ? this.encounters.roomHostiles(room, enemies) : 0;
      const availability: ObjectiveAvailability = this.claimed.has(objective.id) ? 'claimed'
        : remainingGuards > 0 ? 'guarded'
        : objective.id === 'shrine' && hp >= maxHp ? 'healthy'
        : 'ready';
      return { objective, availability, remainingGuards };
    }
    return null;
  }

  activate(
    id: OptionalObjectiveKind,
    player: Point,
    enemies: readonly { id: number; hp: number }[],
    hp: number,
    maxHp: number,
  ): ObjectiveReward | null {
    const prompt = this.nearby(player, enemies, hp, maxHp);
    if (!prompt || prompt.objective.id !== id || prompt.availability !== 'ready') return null;
    this.claimed.add(id);
    return id === 'cache'
      ? { kind: 'ember-edge', damageBonus: 10 }
      : { kind: 'sanctuary', healAmount: 35 };
  }
}
