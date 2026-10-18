import type { Point } from '../movement/MovementController';
import type { Cell, NavigationGrid } from '../navigation/Grid';
import type { DungeonLayout, DungeonRoom } from './DungeonGenerator';

export interface RoomDiscovery {
  id: number;
  role: DungeonRoom['role'];
}

export interface ExplorationDelta {
  /** Newly visible walkable floor cells this frame. */
  revealed: number;
  /** Rooms first physically entered since the previous update. */
  discovered: RoomDiscovery[];
  /** Whether the player's navigation cell changed. */
  movedCell: boolean;
}

const EMPTY_DELTA: ExplorationDelta = { revealed: 0, discovered: [], movedCell: false };

/**
 * Run-scoped exploration state. New floor tiles are visible only when
 * unobstructed from the player's current cell (walls block reveal rays).
 * Entering a chamber discovers it; seeing it from the hallway does not.
 *
 * No browser/Phaser dependency, so seeds, occlusion, and revisit behavior
 * can be verified independently of the renderer.
 */
export class ExplorationTracker {
  readonly revealed: Uint8Array;
  private readonly discoveredIds = new Set<number>();
  private lastCell: string | null = null;
  private revealedCount = 0;
  private readonly floorCount: number;

  constructor(
    readonly dungeon: DungeonLayout,
    private readonly grid: NavigationGrid,
    private readonly radiusCells = 7,
  ) {
    if (radiusCells < 1 || !Number.isFinite(radiusCells)) {
      throw new Error('Visibility radius must be positive and finite');
    }
    this.revealed = new Uint8Array(dungeon.floors.length);
    this.floorCount = dungeon.floors.reduce((total, tile) => total + (tile === 1 ? 1 : 0), 0);
  }

  get roomsDiscovered(): number { return this.discoveredIds.size; }
  get totalRooms(): number { return this.dungeon.rooms.length; }
  get floorsExplored(): number { return this.revealedCount; }
  get totalFloors(): number { return this.floorCount; }
  get discoveryPercent(): number {
    return this.totalRooms ? Math.round(this.roomsDiscovered / this.totalRooms * 100) : 0;
  }

  hasDiscovered(roomId: number): boolean { return this.discoveredIds.has(roomId); }
  hasSeen(cell: Cell): boolean {
    return this.grid.inBounds(cell) && this.revealed[cell.y * this.dungeon.columns + cell.x] === 1;
  }

  currentRoom(position: Point): DungeonRoom | null {
    const cell = this.grid.cellAt(position);
    return this.dungeon.rooms.find(room =>
      cell.x >= room.x && cell.x < room.x + room.width &&
      cell.y >= room.y && cell.y < room.y + room.height
    ) ?? null;
  }

  update(position: Point): ExplorationDelta {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return EMPTY_DELTA;
    const cell = this.grid.cellAt(position);
    if (!this.grid.isWalkable(cell)) return EMPTY_DELTA;
    const key = this.grid.key(cell);
    if (this.lastCell === key) return EMPTY_DELTA;
    this.lastCell = key;

    let revealed = 0;
    const origin = this.grid.center(cell);
    const radius = this.radiusCells;
    for (let offsetY = -radius; offsetY <= radius; offsetY++) {
      for (let offsetX = -radius; offsetX <= radius; offsetX++) {
        if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
        const target = { x: cell.x + offsetX, y: cell.y + offsetY };
        if (!this.grid.isWalkable(target) || this.hasSeen(target)) continue;
        if (!this.grid.isSegmentWalkable(origin, this.grid.center(target))) continue;
        this.revealed[target.y * this.dungeon.columns + target.x] = 1;
        revealed++;
      }
    }
    this.revealedCount += revealed;

    const room = this.currentRoom(position);
    const discovered: RoomDiscovery[] = [];
    if (room && !this.discoveredIds.has(room.id)) {
      this.discoveredIds.add(room.id);
      discovered.push({ id: room.id, role: room.role });
    }
    return { revealed, discovered, movedCell: true };
  }
}
