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
    const start = this.cellAt(from);
    const end = this.cellAt(to);
    if (!this.isWalkable(start) || !this.isWalkable(end)) return false;
    if (start.x === end.x && start.y === end.y) return true;

    // Grid traversal visits every crossed cell, including both neighbors when
    // crossing an exact grid corner. Sampling the line at intervals misses these.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const stepX = Math.sign(dx), stepY = Math.sign(dy);
    const tDeltaX = dx === 0 ? Infinity : this.cellSize / Math.abs(dx);
    const tDeltaY = dy === 0 ? Infinity : this.cellSize / Math.abs(dy);
    let tMaxX = dx === 0 ? Infinity : ((stepX > 0 ? (start.x + 1) * this.cellSize : start.x * this.cellSize) - from.x) / dx;
    let tMaxY = dy === 0 ? Infinity : ((stepY > 0 ? (start.y + 1) * this.cellSize : start.y * this.cellSize) - from.y) / dy;
    let x = start.x, y = start.y;
    const maxSteps = this.columns + this.rows + 2;
    for (let i = 0; i < maxSteps && (x !== end.x || y !== end.y); i++) {
      if (Math.abs(tMaxX - tMaxY) < 1e-10) {
        if (!this.isWalkable({x: x + stepX, y}) || !this.isWalkable({x, y: y + stepY})) return false;
        x += stepX; y += stepY;
        tMaxX += tDeltaX; tMaxY += tDeltaY;
      } else if (tMaxX < tMaxY) {
        x += stepX; tMaxX += tDeltaX;
      } else {
        y += stepY; tMaxY += tDeltaY;
      }
      if (!this.isWalkable({x, y})) return false;
    }
    return x === end.x && y === end.y;
  }
}
