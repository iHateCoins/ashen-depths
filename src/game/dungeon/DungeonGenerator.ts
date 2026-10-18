import type { Point } from '../movement/MovementController';
import { NavigationGrid, type Cell } from '../navigation/Grid';

export const DUNGEON_COLUMNS = 72;
export const DUNGEON_ROWS = 48;
export const DUNGEON_CELL_SIZE = 32;

export type ChamberRole = 'entrance' | 'chamber' | 'cache' | 'depth';
export interface DungeonRoom {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  center: Cell;
  role: ChamberRole;
}
export interface DungeonPassage {
  from: number;
  to: number;
  bend: 'horizontal-first' | 'vertical-first';
}
export interface DungeonLayout {
  seed: number;
  columns: number;
  rows: number;
  cellSize: number;
  /** Row-major tiles: 1 means traversable floor, 0 is solid. */
  floors: Uint8Array;
  rooms: DungeonRoom[];
  passages: DungeonPassage[];
  entrance: Point;
  depth: Point;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInteger(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInteger(random, 0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function worldPoint(cell: Cell): Point {
  return {
    x: (cell.x + 0.5) * DUNGEON_CELL_SIZE,
    y: (cell.y + 0.5) * DUNGEON_CELL_SIZE,
  };
}

function setFloor(floors: Uint8Array, x: number, y: number): void {
  // Preserve a continuous solid border surrounding the entire level.
  if (x < 1 || y < 1 || x >= DUNGEON_COLUMNS - 1 || y >= DUNGEON_ROWS - 1) return;
  floors[y * DUNGEON_COLUMNS + x] = 1;
}

function corridor(floors: Uint8Array, start: Cell, finish: Cell): void {
  if (start.x !== finish.x && start.y !== finish.y) {
    throw new Error('Corridor sections must be axis-aligned');
  }
  const dx = Math.sign(finish.x - start.x);
  const dy = Math.sign(finish.y - start.y);
  const distance = Math.abs(finish.x - start.x) + Math.abs(finish.y - start.y);
  for (let i = 0; i <= distance; i++) {
    const x = start.x + i * dx;
    const y = start.y + i * dy;
    // Three-cell-wide hallways allow passage through combat crowds.
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        setFloor(floors, x + offsetX, y + offsetY);
      }
    }
  }
}

function linkRooms(floors: Uint8Array, a: DungeonRoom, b: DungeonRoom, bend: DungeonPassage['bend']): void {
  const corner = bend === 'horizontal-first'
    ? { x: b.center.x, y: a.center.y }
    : { x: a.center.x, y: b.center.y };
  corridor(floors, a.center, corner);
  corridor(floors, corner, b.center);
}

/**
 * Eight connected chambers distributed across three rows/columns.
 *
 * The central entrance connects to at least three cardinal rooms; every
 * remaining corner attaches to a cardinal room. Extra cross-connections
 * produce at least one loop and multiple useful backtracking routes.
 * All geometry is carved into ONE continuous, scrollable floor grid.
 */
export function generateDungeon(seed: number): DungeonLayout {
  if (!Number.isFinite(seed)) throw new Error('Dungeon seed must be finite');
  const normalizedSeed = seed >>> 0;
  const random = seededRandom(normalizedSeed);
  const perimeter = [0, 1, 2, 3, 5, 6, 7, 8];
  const omitted = perimeter[randomInteger(random, 0, perimeter.length - 1)];
  const selected = [4, ...perimeter.filter(id => id !== omitted)];
  const chosen = new Set(selected);
  const slotsX = [12, 36, 60];
  const slotsY = [9, 24, 39];
  const rooms: DungeonRoom[] = selected.map(id => {
    const width = randomInteger(random, 11, 14);
    const height = randomInteger(random, 9, 12);
    const center = {
      x: slotsX[id % 3] + randomInteger(random, -2, 2),
      y: slotsY[Math.floor(id / 3)] + randomInteger(random, -1, 1),
    };
    return {
      id,
      x: center.x - Math.floor(width / 2),
      y: center.y - Math.floor(height / 2),
      width, height, center,
      role: id === 4 ? 'entrance' : 'chamber',
    };
  });
  const byId = new Map(rooms.map(room => [room.id, room]));
  const cardinal = [1, 3, 5, 7].filter(id => chosen.has(id));
  const passages: DungeonPassage[] = [];
  for (const id of cardinal) {
    passages.push({
      from: 4, to: id,
      bend: random() < 0.5 ? 'horizontal-first' : 'vertical-first',
    });
  }
  const cornerParents: Record<number, readonly number[]> = {
    0: [1, 3], 2: [1, 5], 6: [3, 7], 8: [5, 7],
  };
  const extra: { from: number; to: number }[] = [];
  for (const id of [0, 2, 6, 8].filter(id => chosen.has(id))) {
    const candidates = cornerParents[id].filter(parent => chosen.has(parent));
    const primary = shuffled(candidates, random)[0];
    if (primary === undefined) throw new Error('Disconnected corner in selected layout');
    passages.push({
      from: primary, to: id,
      bend: random() < 0.5 ? 'horizontal-first' : 'vertical-first',
    });
    for (const other of candidates) if (other !== primary) extra.push({ from: other, to: id });
  }

  // At least one cycle, sometimes two. There is still an optional branch.
  const crossLinks = shuffled(extra, random).slice(0, Math.min(extra.length, randomInteger(random, 1, 2)));
  for (const link of crossLinks) {
    passages.push({ ...link, bend: random() < 0.5 ? 'horizontal-first' : 'vertical-first' });
  }

  const entrance = byId.get(4)!;
  const longest = rooms.filter(room => room.id !== 4).sort((a, b) =>
    (Math.abs(b.center.x - entrance.center.x) + Math.abs(b.center.y - entrance.center.y)) -
    (Math.abs(a.center.x - entrance.center.x) + Math.abs(a.center.y - entrance.center.y)) || a.id - b.id
  );
  longest[0].role = 'depth';
  const cacheRoom = longest.find(room => room.id !== longest[0].id && room.id % 2 === 0)
    ?? longest.find(room => room.id !== longest[0].id)!;
  cacheRoom.role = 'cache';

  const floors = new Uint8Array(DUNGEON_COLUMNS * DUNGEON_ROWS);
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) setFloor(floors, x, y);
    }
  }
  for (const passage of passages) {
    linkRooms(floors, byId.get(passage.from)!, byId.get(passage.to)!, passage.bend);
  }

  return {
    seed: normalizedSeed,
    columns: DUNGEON_COLUMNS,
    rows: DUNGEON_ROWS,
    cellSize: DUNGEON_CELL_SIZE,
    rooms,
    passages,
    floors,
    entrance: worldPoint(entrance.center),
    depth: worldPoint(longest[0].center),
  };
}

export function dungeonFloorAt(layout: DungeonLayout, cell: Cell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < layout.columns && cell.y < layout.rows &&
    layout.floors[cell.y * layout.columns + cell.x] === 1;
}

export function createDungeonNavigationGrid(layout: DungeonLayout): NavigationGrid {
  const grid = new NavigationGrid(
    layout.columns * layout.cellSize,
    layout.rows * layout.cellSize,
    layout.cellSize,
  );
  for (let y = 0; y < layout.rows; y++) {
    for (let x = 0; x < layout.columns; x++) {
      if (!dungeonFloorAt(layout, { x, y })) grid.setBlocked({ x, y });
    }
  }
  return grid;
}

/** A URL seed lets testers reproduce the exact dungeon while sharing a link. */
export function dungeonSeedFromSearch(search: string, newSeed: () => number): number {
  const value = new URLSearchParams(search).get('seed');
  if (value !== null && /^(?:0|[1-9][0-9]{0,9})$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed <= 0xFFFFFFFF) return parsed;
  }
  return newSeed() >>> 0;
}
