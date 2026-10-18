# Replay Trial / Restart Expedition pointer fix

## Reproduced regression

After clearing M02 PR05's three waves, the **REPLAY TRIAL** button was visible but did not restart the run. The new Playwright end-to-end test reproduced this on desktop Chromium, mobile Chromium, and WebKit by advancing the real scene to victory and tapping the visible screen position.

The terminal screens used interactive children of Phaser Containers with `setScrollFactor(0)`. Their hit testing could be offset by the scrolling camera, even when the button appeared correctly positioned. Propagating the zero scroll factor to all children alone did **not** resolve the regression in browser tests.

## Correction

Both the victory and defeat terminal panels are now **native DOM overlays** placed above Phaser's canvas with a screen-fixed layout and real accessible `<button>` elements. Native DOM hit areas do not depend on camera or zoom transforms. Restart actions still call the scene's existing `restart()` method.

Overlays are created when a scene starts and removed on scene shutdown/restart to avoid orphaned buttons or duplicated handlers.

## Regression coverage

- Local-host-only Phaser test handle drives the real running scene into victory; no debug controls are exposed on the public GitHub Pages hostname.
- Playwright clicks/taps the actual **REPLAY TRIAL** button (desktop mouse, mobile Chromium, and iPhone-compatible WebKit).
- The test verifies the encounter resets to wave 0 and the countdown begins again.
- A second test exercises the **RESTART EXPEDITION** button on the defeat overlay.
- Existing build, typecheck, update-version, and browser-launch checks still run.

## Manual acceptance

1. On the iPhone Home Screen app, finish all three waves and tap **REPLAY TRIAL**. Confirm health and wave progress reset and a fresh Wave 1 countdown begins.
2. Let enemies defeat the player and try **RESTART EXPEDITION**.
3. Confirm both panels remain centered in landscape and portrait and the iOS auto-updater continues to work.
