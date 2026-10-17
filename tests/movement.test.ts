import { describe, expect, it } from 'vitest';
import { MovementController } from '../src/game/movement/MovementController';

describe('MovementController', () => {
  it('moves toward a destination without overshooting', () => {
    const movement = new MovementController({ x: 0, y: 0 }, 100);
    movement.moveTo({ x: 10, y: 0 });
    movement.update(0.05);
    expect(movement.position.x).toBe(5);
    movement.update(0.05);
    expect(movement.position).toEqual({ x: 10, y: 0 });
    expect(movement.destination).toBeNull();
  });
  it('replaces an existing destination immediately', () => {
    const movement = new MovementController({ x: 0, y: 0 }, 100);
    movement.moveTo({ x: 100, y: 0 });
    movement.moveTo({ x: 0, y: 100 });
    movement.update(0.05);
    expect(movement.position.x).toBe(0);
    expect(movement.position.y).toBe(5);
  });
  it('ignores invalid destination coordinates', () => {
    const movement = new MovementController({ x: 0, y: 0 });
    movement.moveTo({ x: Number.NaN, y: 12 });
    expect(movement.destination).toBeNull();
  });
  it('does not advance on invalid or negative delta', () => {
    const movement = new MovementController({ x: 0, y: 0 });
    movement.moveTo({ x: 10, y: 0 });
    movement.update(-1);
    expect(movement.position.x).toBe(0);
  });
});
