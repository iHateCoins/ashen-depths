export interface Point { x: number; y: number }
export class MovementController {
  position: Point;
  destination: Point | null = null;
  readonly speed: number;
  constructor(position: Point, speed = 190) {
    this.position = { ...position };
    this.speed = speed;
  }
  moveTo(target: Point): void {
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
    this.destination = { ...target };
  }
  stop(): void { this.destination = null; }
  update(deltaSeconds: number): void {
    if (!this.destination || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const dx = this.destination.x - this.position.x;
    const dy = this.destination.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    const step = this.speed * Math.min(deltaSeconds, 0.05);
    if (distance <= step || distance < 0.5) {
      this.position = { ...this.destination };
      this.destination = null;
      return;
    }
    this.position.x += dx / distance * step;
    this.position.y += dy / distance * step;
  }
}
