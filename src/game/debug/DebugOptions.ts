export interface DebugOptions { visible: boolean; grid: boolean; routes: boolean; collision: boolean }
export function createDebugOptions(): DebugOptions {
  return { visible: false, grid: false, routes: false, collision: false };
}
export function toggleDebug(options: DebugOptions): DebugOptions {
  const visible = !options.visible;
  return { visible, grid: visible, routes: visible, collision: visible };
}
