export type Facing = 'north' | 'south' | 'east' | 'west';
export type MotionState = 'idle' | 'walk';
export interface AnimationState { facing: Facing; motion: MotionState; phase: number }
export class DirectionalAnimator {
  readonly state: AnimationState = { facing: 'south', motion: 'idle', phase: 0 };
  update(dx: number, dy: number, deltaSeconds: number): AnimationState {
    const moving = Math.hypot(dx, dy) > 0.001;
    this.state.motion = moving ? 'walk' : 'idle';
    if (moving) {
      this.state.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
      this.state.phase = (this.state.phase + Math.max(0, deltaSeconds) * 8) % 4;
    } else {
      this.state.phase = 0;
    }
    return this.state;
  }
}
