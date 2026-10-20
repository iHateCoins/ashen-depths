# M07 portrait/mobile HUD stabilization

Based on owner-provided iPhone screenshots in **portrait and landscape**, not an M08 visual redesign. This is a functional M07 follow-up that makes the existing controls usable before the owner's full milestone playtest.

## Issues confirmed
- Phaser-drawn title and HP began inside the iPhone's translucent system status-bar region. The old HUD used fixed y=3, y=38 and y=79 positions.
- A fixed 2-pixel-per-cell minimap occupied much of the upper portrait viewport and competed with the long, five-line objective text.
- Bottom SKILLS, CLASS, STASH and BAG controls all had independent fixed x positions. In portrait, the wide class button hid part or all of the stash button.
- In landscape, the skill readout and low-priority seed/debug labels could land too near the bottom control row.

## M07 fix
- A single non-interactive hidden element resolves actual browser `safe-area-inset-*` values. Phaser's HUD and minimap both use the same insets. No hardcoded iPhone model dimensions, and no changes to world coordinates or tap-to-move input.
- At portrait phone widths, minimize and reflow the fixed HUD into a narrower left column with short objective/counters; the minimap becomes 1.2 pixels/cell with its input-blocking zone resized to match, and its heading shrinks.
- The skill readout is positioned after the *measured wrapped objective height* rather than at a fixed y, and title/health/labels respect the system safe top/left. Orientation changes immediately reformat the objective without a character move.
- Portrait SKILLS/STASH occupy the upper of **two distinct bottom rows** and CLASS/BAG occupy the lower row. All four remain visible, within viewport, at least 48px tall, individually clickable/tappable, and respect side and bottom safe insets.
- Reward and interaction docks sit above those two rows, and the build identifier is relocated so it cannot hide BAG.
- In landscape (and desktop) retain the existing broad layout; hide floor seed unless on desktop/debug rather than rendering behind controls.
- No character progression, loot, combat tuning, crafting, world movement, minimap knowledge, or persisted save data changes.

## Regression
`e2e/portrait-layout.pw.ts` runs on **all existing Playwright projects**. It explicitly resizes to 390×844 portrait and checks independent touch-hit centers, nonoverlap, minimum tap dimensions, no screen clipping, safe-area title position and absence of HUD/minimap collisions. It then tests 844×390 landscape and 390×844 portrait: Chromium exercises live viewport rotation in the same page, while iPhone Safari uses two independently initialized WebKit mobile contexts because Playwright mobile WebKit does not consistently update the effective layout viewport when changing `page.setViewportSize` after page load. Both orientations remain fully checked in Safari; real-device rotation is reserved for the owner's M07 device playtest. It also opens and closes each of the four panels through its real controls.

Keep the existing desktop/landscape Playwright suites passing, and wait for **owner approval** before merging. The user will conduct their full M07 playtest after this functional stabilization step.
