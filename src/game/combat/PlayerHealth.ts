export class PlayerHealth {
  maxHp: number;
  hp: number;
  defeated = false;
  constructor(maxHp = 100) { this.maxHp=maxHp; this.hp=maxHp; }
  damage(amount: number): boolean {
    if (this.defeated || !Number.isFinite(amount) || amount <= 0) return false;
    this.hp=Math.max(0,this.hp-amount);
    if (this.hp === 0) this.defeated=true;
    return true;
  }
  heal(amount: number): number {
    if (this.defeated || !Number.isFinite(amount) || amount <= 0) return 0;
    const previous = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - previous;
  }
  /**
   * Keep the same amount of missing health when equipment changes maximum HP.
   * Unequipping a vitality item cannot be used to heal or kill the player.
   */
  setMaxHp(value: number): void {
    if (!Number.isFinite(value) || value < 1) throw new Error('Maximum HP must be positive');
    const missing = Math.max(0, this.maxHp - this.hp);
    this.maxHp = value;
    this.hp = this.defeated ? 0 : Math.max(1, Math.min(value, value - missing));
  }
  reset(): void { this.hp=this.maxHp; this.defeated=false; }
}
