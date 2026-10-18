import type { EnemyKind } from './EnemyAI';

export type EncounterPhase = 'countdown' | 'combat' | 'complete';

export interface WaveStarted {
  type: 'wave-started';
  wave: number;
  kinds: readonly EnemyKind[];
}
export interface WaveCleared {
  type: 'wave-cleared';
  wave: number;
  final: boolean;
}
export type EncounterEvent = WaveStarted | WaveCleared;

/** Finite prototype encounter. The dungeon/extraction loop will replace it in M03/M04. */
export const ENCOUNTER_WAVES: readonly (readonly EnemyKind[])[] = [
  ['wretch', 'wretch', 'wretch'],
  ['wretch', 'wretch', 'wretch', 'wretch', 'brute'],
  ['wretch', 'wretch', 'wretch', 'wretch', 'wretch', 'brute', 'brute'],
];

/**
 * Independent of Phaser and the enemy system. An encounter starts only after
 * its intermission and advances when every spawned enemy has been defeated.
 */
export class EncounterDirector {
  phase: EncounterPhase = 'countdown';
  wave = 0;
  timeRemaining = 1.5;

  get totalWaves(): number { return ENCOUNTER_WAVES.length; }
  get completed(): boolean { return this.phase === 'complete'; }

  update(deltaSeconds: number, aliveEnemies: number): EncounterEvent[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return [];
    if (this.phase === 'complete') return [];

    if (this.phase === 'countdown') {
      this.timeRemaining = Math.max(0, this.timeRemaining - Math.min(deltaSeconds, 0.1));
      if (this.timeRemaining > 1e-8) return [];

      this.wave++;
      this.phase = 'combat';
      return [{ type: 'wave-started', wave: this.wave, kinds: ENCOUNTER_WAVES[this.wave - 1] }];
    }

    // Call this after all combat damage and death bookkeeping for the frame.
    if (aliveEnemies > 0) return [];
    const final = this.wave >= this.totalWaves;
    this.phase = final ? 'complete' : 'countdown';
    this.timeRemaining = final ? 0 : 3;
    return [{ type: 'wave-cleared', wave: this.wave, final }];
  }
}
