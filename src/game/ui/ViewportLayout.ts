/**
 * Browser-safe viewport geometry shared by the Phaser HUD and native controls.
 * A hidden probe resolves CSS env(safe-area-inset-*) to actual pixel values:
 * iPhone PWA status bars/notches must not overlap canvas-bound game labels.
 * Never use device-model heuristics or hardcode a 59px notch.
 */
export interface ViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function narrowPortrait(width: number, height: number): boolean {
  return width <= 600 && height > width;
}

let probe: HTMLElement | null = null;

export function viewportInsets(): ViewportInsets {
  if (!probe || !probe.isConnected) {
    probe = document.createElement('div');
    probe.id = 'ashen-safe-area-probe';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = [
      'position:fixed', 'inset:0', 'width:0', 'height:0',
      'visibility:hidden', 'pointer-events:none',
      'padding-top:env(safe-area-inset-top,0px)',
      'padding-right:env(safe-area-inset-right,0px)',
      'padding-bottom:env(safe-area-inset-bottom,0px)',
      'padding-left:env(safe-area-inset-left,0px)',
    ].join(';');
    document.body.append(probe);
  }
  const style = getComputedStyle(probe);
  const n = (v: string): number => Math.max(0, parseFloat(v) || 0);
  return {
    top: n(style.paddingTop),
    right: n(style.paddingRight),
    bottom: n(style.paddingBottom),
    left: n(style.paddingLeft),
  };
}
