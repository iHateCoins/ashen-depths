import type { Point } from '../movement/MovementController';
export interface Enemy { id: number; position: Point; hp: number; maxHp: number }
export interface Attack { targetId: number; damage: number }
export class AutoCombat {
  cooldown = 0;
  bonusDamage = 0;
  readonly range: number;
  readonly damage: number;
  readonly interval: number;
  constructor(range = 250, damage = 25, interval = 0.7) {
    this.range = range; this.damage = damage; this.interval = interval;
  }
  update(player: Point, enemies: Enemy[], dt: number, hasLineOfSight: (from: Point, to: Point) => boolean = () => true): Attack[] {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    this.cooldown = Math.max(0, this.cooldown - Math.min(dt, 0.1));
    if (this.cooldown > 0) return [];
    const target = enemies.filter(e => e.hp > 0 && Math.hypot(e.position.x-player.x,e.position.y-player.y) <= this.range && hasLineOfSight(player, e.position))
      .sort((a,b) => {
        const da = Math.hypot(a.position.x-player.x,a.position.y-player.y);
        const db = Math.hypot(b.position.x-player.x,b.position.y-player.y);
        return da-db || a.id-b.id;
      })[0];
    if (!target) return [];
    const totalDamage = this.damage + this.bonusDamage;
    target.hp = Math.max(0,target.hp-totalDamage);
    this.cooldown = this.interval;
    return [{targetId:target.id,damage:totalDamage}];
  }
}
