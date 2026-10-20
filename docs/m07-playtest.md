# Ashen Depths — Full M07 Playtest (before starting M08)

**When to run:** Only after M07 PR06 is approved/merged and all CI checks pass. No separate playtesting is requested for PR05/PR06. Target **60–90 minutes** of focused gameplay plus notes; longer if useful. The test is **not complete just because CI passes**.

**Play:** https://ihatecoins.github.io/ashen-depths/ (the build deployed from main after merge). Desktop browser first; then repeat the important mobile controls on iPhone or landscape touch. If the build appears stale, reload normally but **do not clear localStorage**.

## Protect your current progression first

Existing stash, Ember balance, unlocked skills, class preference, passive milestones and allocations are stored **only in the current browser's localStorage** as `ashen-depths-stash-v1`. Browser private/incognito windows use isolated temporary storage, which makes them a good choice for deliberate death, corruption, and new-character tests. **Do not remove site data, reset the browser profile, clear localStorage or run scripts against an existing saved character.** If desired on desktop, back up the entire raw value of that key from DevTools → Application/Storage → Local Storage to a private text file, outside the game. This is a manual backup, not an automated feature.

Use a separate private browser window/profile for risky test cases so you do not lose real gear.

## Session A — New character and early loop (~15–20 minutes)

- [ ] Start at **Depth 1**, confirm the dungeon displays and the entrance camp UI loads without stuck overlays or missing buttons.
- [ ] Choose **Vanguard**; inspect starting HP, basic attack reach, and automatic Crescent Cleave. Start a separate fresh character/profile as **Arcanist**, with Cinder Burst, to confirm different play styles.
- [ ] Tap/click to move; navigate branching halls, avoid walls, inspect fog/minimap, zoom on desktop, and verify movement does not mis-target under floating DOM controls.
- [ ] Fight normal enemies and a brute; evaluate enemy telegraphs, collision, automatic targeting and whether dodging feels intentional rather than random.
- [ ] Pick up equipment, compare its stat contributions, equip/unequip, discard/reclaim, and check the 24-item expedition bag constraint.
- [ ] Open a Sealed Cache; select an actual discovery (skill, support or Forge Ember) from the reward chooser. Leaving a reward unclaimed should warn before exit, not silently grant it.
- [ ] Defeat the original **Depth 1 Warden**. Verify **Finish Expedition** and **Descend** both become available. Descend only by explicit selection; Warden must not force an exit.
- [ ] Verify defeating Depth 1 does **not** grant a passive point.

## Session B — The core extraction decision (~20–30 minutes)

- [ ] On **Depth 2**, verify the **Ash Reaver** chases faster, has a shorter attack warning and a smaller marked danger circle than the Depth 1 Warden.
- [ ] Try repositioning during its locked-target windup: moving out of the marked circle must dodge it; enemy strikes through walls should not register.
- [ ] Defeat Depth 2 Warden; verify **+1 unsecured passive point** appears for the selected class. Simply entering Depth 2 must not have granted one.
- [ ] Examine the decision to **extract with equipment and a passive point** versus continuing at reduced health. Confirm that the cost of pushing deeper is tangible.
- [ ] Continue to **Depth 3** in a separate run or when strong enough. Confirm fast **skirmishers**, some **elite** packs, and the wide slow windup of the **Stone Sentinel**. Elite kills should consistently yield at least magic loot.
- [ ] Reach **Depth 4** and defeat its Warden: when Depths 2 and 4 are first-time clears for that class, you should now have **two unsecured points** (or only one if Depth 2 was previously banked).
- [ ] Extract. Confirm the results screen reports the actual Depth, stored gear, chosen skills/supports/Embers and permanently secured points, all together. The gear worn and in the bag both become secured.
- [ ] Start another expedition: bag and health reset; stash, chosen class, skill unlocks, Ember balance and **banked passive points remain**.
- [ ] Repeat an even-depth Warden milestone in that same class. It may still yield loot/discoveries, but must **not** give another permanent passive point.

## Session C — Persistent builds (~15–20 minutes)

- [ ] At the initial camp only, open the **CLASS / PASSIVE TREE** panel. Banked points, spent points and unspent points should be clearly distinguished from points still at risk.
- [ ] Try all three branches (Assault, Ward and Hybrid) over time. Nodes should require prior nodes and **one secured point per purchase**. No free reset/respec is offered yet.
- [ ] Verify bonuses affect live combat: Attack, Spell Power, Armor, Max HP and automatic-skill cooldowns. Equipment upgrades should still feel more consequential than individual passive nodes.
- [ ] Switch to the opposite class at camp. The other class has **independent milestone credit and allocations**; your purchased nodes should return when switching back.
- [ ] Try changing class after leaving camp, taking loot, or descending; changes should be disabled but viewing the tree should remain possible.
- [ ] Equip up to two different automatic skills (never two copies of the same active skill), add earned supports, verify damage/area/cooldown interactions and cross-class skills.
- [ ] Inspect advanced item bases and tiered affixes from deeper floors. Check that rerolling eligible **secured** gear with Forge Embers only works at camp, consumes the proper Ember amount and cannot forge an item a second time.
- [ ] Close/reopen or reload the browser after saving a passive allocation and forged item; both should persist without deleting older gear or unlocks.

## Session D — Extraction, death and device checks (~10–20 minutes)

- [ ] In an isolated disposable browser profile, deliberately die **after** earning an unsecured even-depth passive point. No at-risk item, point or discovery should be banked; already-secured items and points remain.
- [ ] Try a waystone **early extraction**, including leaving with a pending discovery. Confirm actual save only after extraction completes, damage cancels the channel, and a failed save does not falsely claim success.
- [ ] Inspect controls on a real iPhone or landscape touch device. Buttons should respond to taps without a hidden canvas swallowing input; dialogs should scroll; title, minimap and text should remain readable.
- [ ] Run 3–4 consecutive new expeditions and watch for duplicate fixed UI controls, missing interaction buttons, FPS dips, frozen movement or growing load times.
- [ ] Compare **Depths 4–8** if practical. Monster HP and damage should keep rising as item levels increase; the curve should not abruptly plateau at Depth 16 (automated, human observation optional).

## Findings and release decision

Record each issue with **device/browser**, **dungeon seed** (use `?seed=42` for reproducible scenarios), **class**, **depth**, **steps to reproduce**, **expected vs observed behavior** and ideally a screenshot. Prioritize:
- **Blocker:** cannot start/play/extract, save loss/corruption, impossible Warden fight, class/passive progression lost.
- **Major:** incorrect point awards, duplicated loot, broken boss telegraphs, touch input blocked, seriously skewed risk/reward.
- **Minor:** layout imperfections, unclear copy, nonblocking visual bugs; polish appropriately in M08.

**M07 accepted:** all blocker/major regressions resolved and the user is comfortable with the full progression/extraction loop on desktop and iPhone. Remaining cosmetic/audio requests can move into M08.

M08 should not begin until this M07 test and any required M07 follow-up fixes are complete.
