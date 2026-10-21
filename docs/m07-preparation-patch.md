# M07 stabilization — expedition preparation and unobtrusive combat interactions

## Player journey

Fresh load and each post-run restart now follow three native, touch-safe steps:

1. **ASHEN DEPTHS title:** explicit **PREPARE EXPEDITION** action and existing-character summary.
2. **Character class:** choose Vanguard or Arcanist. The choice uses the existing revision-checked `preferredClass` save; no character data is erased. Both classes retain access to cross-archetype loot and any unlocked skills.
3. **Skill loadout:** choose up to two different unlocked active skills, with optional exclusive earned supports, then **ENTER DUNGEON**. At least one skill must be equipped.

The dungeon scene is initialized but **combat/movement/time cannot advance** while preparation is open. World pointer clicks cannot pass through the fixed overlay. **Descending to the next floor** skips the preparation UI entirely, carrying the current risky loadout. **Death and extraction** restart with the title screen and intact permanent progress (the old "New Expedition" and "Restart Expedition" actions now lead to preparation). A future persistent hideout can replace the temporary preparation overlay without changing class, stash, reward, extraction, or auto-combat models.

The optional `?intro=1` query enables the full preflight flow on localhost Playwright. Legacy existing localhost E2E suites start directly at the dungeon so hundreds of earlier input/combat/save regressions remain meaningful; new `preparation-flow.pw.ts` explicitly exercises the real intro on desktop, mobile landscape, and WebKit. Public GitHub Pages **always** shows the intro first.

## Combat-time interaction cleanup

A guarded Sealed Cache, or a Sanctuary encountered at full health, is a **non-actionable fact** rather than a modal choice. The huge panel/disabled button is hidden in those cases, and a small **pointer-events:none** hint displays the state. The player can tap-to-move or fight *through* the hint without accidental interactions. When an objective becomes usable, the existing guarded cache/shrine validation and explicit **OPEN CACHE / USE SHRINE** action return; no passive auto-claim.

Skill discoveries, extraction decisions and item forging still have explicit choices with modal UI. Broader interaction-dialog polish is deferred to user feedback; this patch only removes the obstructive **unavailable objective** surfaces reported in the screenshot.

## Safety / acceptance

- Preserve `ashen-depths-stash-v1`, character class preference, banked passive points, spent nodes, learned skills, Forge Embers and gear. No new mandatory migration or new persistent key.
- On class-selection save failure, do not change the equipped starter or claim a different class; show an error.
- Two-slot skill cap and unique active skill/support rules remain enforced by existing `AutoSkillSystem`; locked skills/supports cannot be selected.
- Fresh expedition preparation is not rerun on floor-to-floor descent; victory/defeat offers a route back to title/preparation.
- The guarded cache banner neither covers the playfield nor intercepts movement; the actual interaction remains available when guards are dead.
- Run TypeScript, unit tests, production build, desktop Playwright, mobile-landscape Chromium, iPhone Safari, and the explicit new intro / cache-hint E2E suites. Do not auto-merge.

## M07 test continuation

Once merged, start at the title screen, pick the two classes on successive expeditions, select a learned secondary skill/support, then fight near a guarded cache in portrait and landscape. Report any additional blocking dialogs or button hit areas for subsequent small M07 patches **before M08**.
