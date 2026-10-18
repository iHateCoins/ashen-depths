export class PlayerHealth {
  readonly maxHp: number;
  hp: number;
  defeated = false;
  constructor(maxHp = 100) { this.maxHp=maxHp; this.hp=maxHp; }
  damage(amount: number): boolean {
    if (this.defeated || !Number.isFinite(amount) || amount <= 0) return false;
    this.hp=Math.max(0,this.hp-amount);
    if (this.hp === 0) this.defeated=true;
    return true;
  }
  reset(): void { this.hp=this.maxHp; this.defeated=false; }
}
