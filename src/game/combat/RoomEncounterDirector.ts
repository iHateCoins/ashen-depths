import type { Point } from '../movement/MovementController';
import type { NavigationGrid, Cell } from '../navigation/Grid';
import type { DungeonLayout, DungeonRoom } from '../dungeon/DungeonGenerator';
import type { EnemyKind } from './EnemyAI';
import { lootHash } from '../loot/ExpeditionLoot';
import { wardenForDepth, type WardenVariant } from './DepthEncounters';

export interface RoomEnemyPlacement {
  id: number;
  roomId: number;
  kind: EnemyKind;
  guardian: boolean;
  elite?: true;
  wardenVariant?: WardenVariant;
  maxHp: number;
  position: Point;
}

/**
 * The enemies are populated once, at dungeon creation, rather than spawned
 * when a player clears or enters a room. Rooms and hallways stay seamless.
 * Seeded offsets make every placement reproducible and navigable.
 */
export function planRoomEncounters(
  layout: DungeonLayout, grid: NavigationGrid, depth = 1,
): RoomEnemyPlacement[] {
  const entrance = layout.rooms.find(room => room.role === 'entrance');
  const depth = layout.rooms.find(room => room.role === 'depth');
  if (!entrance || !depth) throw new Error('Missing entrance or deep chamber');

  const offsets: readonly Cell[] = [
    { x: 0, y: 0 }, { x: -3, y: -2 }, { x: 3, y: 2 },
    { x: 3, y: -2 }, { x: -3, y: 2 },
    { x: 0, y: -3 }, { x: 0, y: 3 },
    { x: 4, y: 0 }, { x: -4, y: 0 },
  ];
  const placements: RoomEnemyPlacement[] = [];
  let nextId = 1;

  for (const room of [...layout.rooms].sort((a,b) => a.id - b.id)) {
    if (room.role === 'entrance') continue;
    const remoteness = Math.hypot(
      room.center.x - entrance.center.x, room.center.y - entrance.center.y,
    );
    const remote = remoteness >= 23;
    const count = room.role === 'depth' ? 4 : room.role === 'cache' || remote ? 3 : 2;
    const kinds: EnemyKind[] = room.role === 'depth'
      ? ['brute', 'wretch', 'wretch', 'wretch']
      : room.role === 'cache' || remote
        ? ['brute', ...Array.from({ length: count - 1 }, () => 'wretch' as const)]
        : Array.from({ length: count }, () => 'wretch' as const);

    // Depth 1 keeps its original populations exactly. Deeper floors may
    // replace one wretch with a quick skirmisher and promote a seeded elite.
    if (depth >= 3 && (room.role === 'cache' || remote || room.role === 'depth')) {
      const lastWretch = kinds.lastIndexOf('wretch');
      if (lastWretch >= 0) kinds[lastWretch] = 'skirmisher';
    }
    const eliteRoom = depth >= 3 && room.role !== 'depth' &&
      lootHash(layout.seed,room.id,0xE11E) % 3 === 0;

    const rotation = (layout.seed + room.id * 11) % (offsets.length - 1);
    const candidates = [offsets[0], ...Array.from(
      { length: offsets.length - 1 },
      (_, i) => offsets[1 + (i + rotation) % (offsets.length - 1)],
    )];
    if (room.role !== 'depth') candidates.shift();
    const occupied: Point[] = [];

    for (let i = 0; i < kinds.length; i++) {
      const guardian = room.role === 'depth' && i === 0;
      const kind = kinds[i];
      const offset = candidates.find(candidate => {
        const target = { x: room.center.x + candidate.x, y: room.center.y + candidate.y };
        if (target.x < room.x + 1 || target.x >= room.x + room.width - 1 ||
            target.y < room.y + 1 || target.y >= room.y + room.height - 1 ||
            !grid.isWalkable(target)) return false;
        const point = grid.center(target);
        return occupied.every(previous => Math.hypot(point.x - previous.x, point.y - previous.y) >= 64);
      });
      if (!offset) throw new Error(`No safe spawn for room ${room.id}`);
      const target = { x: room.center.x + offset.x, y: room.center.y + offset.y };
      const position = grid.center(target);
      occupied.push(position);
      placements.push({
        id: nextId++,
        roomId: room.id,
        kind,
        guardian,
        ...(eliteRoom && i === 0 ? { elite: true as const } : {}),
        ...(guardian && depth > 1 ? {wardenVariant:wardenForDepth(depth)} : {}),
        maxHp: guardian ? 300 : kind === 'brute' ? 220
          : kind === 'skirmisher' ? 85 : 100,
        position,
      });
      candidates.splice(candidates.indexOf(offset), 1);
    }
  }
  if (placements.filter(spawn => spawn.guardian).length !== 1) {
    throw new Error('Exactly one deep-chamber guardian is required');
  }
  return placements;
}

/** Clearing optional chambers is never required to finish the expedition. */
export class RoomEncounterDirector {
  readonly placements: readonly RoomEnemyPlacement[];
  readonly guardianId: number;
  readonly depthRoomId: number;
  completed = false;
  hasEnteredDepth = false;

  constructor(readonly dungeon: DungeonLayout, grid: NavigationGrid, depth = 1) {
    this.placements = planRoomEncounters(dungeon, grid, depth);
    this.guardianId = this.placements.find(spawn => spawn.guardian)!.id;
    this.depthRoomId = dungeon.rooms.find(room => room.role === 'depth')!.id;
  }

  get totalEnemies(): number { return this.placements.length; }

  update(player: Point, enemies: readonly { id: number; hp: number }[]): boolean {
    if (this.completed) return false;
    const room = this.dungeon.rooms.find(item => item.id === this.depthRoomId)!;
    const x = Math.floor(player.x / this.dungeon.cellSize);
    const y = Math.floor(player.y / this.dungeon.cellSize);
    if (x >= room.x && x < room.x + room.width &&
        y >= room.y && y < room.y + room.height) this.hasEnteredDepth = true;
    const guardian = enemies.find(enemy => enemy.id === this.guardianId);
    if (this.hasEnteredDepth && guardian !== undefined && guardian.hp <= 0) {
      this.completed = true;
      return true;
    }
    return false;
  }

  guardianAlive(enemies: readonly { id: number; hp: number }[]): boolean {
    return enemies.some(enemy => enemy.id === this.guardianId && enemy.hp > 0);
  }

  roomHostiles(room: DungeonRoom | null, enemies: readonly { id: number; hp: number }[]): number {
    if (!room) return 0;
    const ids = new Set(this.placements.filter(spawn => spawn.roomId === room.id).map(spawn => spawn.id));
    return enemies.filter(enemy => ids.has(enemy.id) && enemy.hp > 0).length;
  }
}
