# Replay Trial / Restart Expedition pointer fix

## Root cause

In M02 PR05, both end-of-trial and defeat screens were attached to Phaser Containers with `setScrollFactor(0)`. The container rendered correctly as a fixed HUD overlay, but Phaser's `setScrollFactor` does not update its child objects unless its `updateChildren` argument is enabled.

The **REPLAY TRIAL** and **RESTART EXPEDITION** controls were interactive children, so their hit testing could be offset by the following dungeon camera despite appearing centered.

## Correction

Use `container.setScrollFactor(0, 0, true)` *after* the interactive child objects have been added. This applies screen-space coordinates to the container and its children. The underlying trial progression and automatic combat remain unchanged.

## Regression coverage

- A local-host-only Phaser test handle drives the real scene to the third-wave victory state.
- Playwright taps the actual game canvas over the **REPLAY TRIAL** label (desktop mouse and mobile touch), not a substitute HTML control.
- It verifies that the encounter returns to wave 0 and `countdown` after the tap.
- A second test exercises **RESTART EXPEDITION** on the defeat overlay.
- The browser tests run on desktop Chromium, mobile Chromium, and WebKit.
- Normal deployment does not expose the test-only game handle on GitHub Pages.

## Manual test after merge

1. In the installed iPhone Home Screen app, finish the three-wave trial.
2. Tap **REPLAY TRIAL** and confirm the player returns to the starting position, health resets to 100, and Wave 1 countdown begins.
3. Repeat after moving the player around; verify the restart button is still tappable.
4. Also test **RESTART EXPEDITION** after losing all HP.

The automatic iOS web-app updater should deliver this fix after merging and successful Pages deployment.
