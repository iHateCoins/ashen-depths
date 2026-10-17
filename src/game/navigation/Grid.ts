import type { Point } from '../movement/MovementController';
export interface Cell { x: number; y: number }
export class NavigationGrid {
  readonly columns: number;
  readonly rows: number;
  private blocked = new Set<string>();
  constructor(readonly width: number, readonly height: number, readonly cellSize: number) {
    this.columns = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
  }
  key(cell: Cell): string { return `${cell.x},${cell.y}`; }
  inBounds(cell: Cell): boolean { return cell.x >= 0 && cell.y >= 0 && cell.x < this.columns && cell.y < this.rows; }
  isWalkable(cell: Cell): boolean { return this.inBounds(cell) && !this.blocked.has(this.key(cell)); }
  setBlocked(cell: Cell, blocked = true): void {
    if (!this.inBounds(cell)) return;
    if (blocked) this.blocked.add(this.key(cell));
    else this.blocked.delete(this.key(cell));
  }
  cellAt(point: Point): Cell {
    return { x: Math.floor(point.x / this.cellSize), y: Math.floor(point.y / this.cellSize) };
  }
  center(cell: Cell): Point { return { x: (cell.x + 0.5) * this.cellSize, y: (cell.y + 0.5) * this.cellSize }; }
  nearestWalkable(start: Cell): Cell | null {
    if (!this.inBounds(start)) return null;
    if (this.isWalkable(start)) return start;
    const visited = new Set<string>([this.key(start)]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      for (const next of [{x:cell.x+1,y:cell.y},{x:cell.x-1,y:cell.y},{x:cell.x,y:cell.y+1},{x:cell.x,y:cell.y-1}]) {
        if (!this.inBounds(next) || visited.has(this.key(next))) continue;
        if (this.isWalkable(next)) return next;
        visited.add(this.key(next)); queue.push(next);
      }
    }
    return null;
  }
  isSegmentWalkable(from: Point, to: Point): boolean {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / (this.cellSize / 5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(this.cellAt({x: from.x + (to.x-from.x)*t, y: from.y + (to.y-from.y)*t}))) return false;
    }
    return true;
  }
}
