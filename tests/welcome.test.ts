import { describe, expect, it } from 'vitest';
import { buildWelcomeCopy } from '../src/game/welcome';

describe('game bootstrap', () => {
  it('identifies the first milestone', () => {
    expect(buildWelcomeCopy()).toContain('M01 / PR01');
  });
});
