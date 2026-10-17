import { describe, expect, it } from 'vitest';
import { DirectionalAnimator } from '../src/game/rendering/DirectionalAnimator';
import { createDebugOptions, toggleDebug } from '../src/game/debug/DebugOptions';
describe('four-direction motion states', () => {
  it('chooses facing by dominant movement axis', () => {
    const a = new DirectionalAnimator();
    expect(a.update(0,-2,0.1).facing).toBe('north');
    expect(a.update(-3,1,0.1).facing).toBe('west');
    expect(a.update(3,0,0.1).facing).toBe('east');
    expect(a.update(0,3,0.1).facing).toBe('south');
  });
  it('returns to idle while retaining facing', () => {
    const a = new DirectionalAnimator();
    a.update(-3,0,0.1);
    const state = a.update(0,0,0.1);
    expect(state.motion).toBe('idle');
    expect(state.facing).toBe('west');
    expect(state.phase).toBe(0);
  });
  it('keeps animation phase within four frames', () => {
    const a = new DirectionalAnimator();
    for (let i=0;i<100;i++) a.update(1,0,0.05);
    expect(a.state.phase).toBeGreaterThanOrEqual(0);
    expect(a.state.phase).toBeLessThan(4);
  });
});
describe('debug controls', () => {
  it('start disabled and toggle together', () => {
    const initial = createDebugOptions();
    expect(initial.visible).toBe(false);
    const on = toggleDebug(initial);
    expect(on).toEqual({visible:true,grid:true,routes:true,collision:true});
    expect(toggleDebug(on)).toEqual(initial);
  });
});
