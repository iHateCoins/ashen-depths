# M05 Discovery Reward Claim Clarity — Standalone Fix

## Investigation
Both a defeated Warden and an opened Sealed Cache **offer one reward choice each**. They do not automatically award a Forge Ember. The player must use the DISCOVERIES control and select one skill, support or Ember from each source. Only chosen rewards are included in the atomic extraction save. If the player exits without choosing, the choice is forfeited. The existing save and tests correctly retain selected Embers, but this condition was not clearly communicated.

## UX correction
- Discovery control is relabeled **CLAIM REWARDS N** so optional rewards are visible as a required decision before exit.
- The Warden **FINISH EXPEDITION** button explicitly displays **N UNCLAIMED REWARDS LOST**, while retaining its accessible name for keyboard/screen-reader and existing automated controls.
- Waystone **EXTRACT NOW** shows the same count and a warning to visit CLAIM REWARDS before beginning the extraction channel. The warning remains during channeling.
- After either exit, the result summary reports exactly how many discovery choices were forfeited; selected Ember and skill reward counts are unchanged.
- Extracting without choosing remains allowed deliberately, preserving meaningful player agency. No automatic Ember grants, item crafting balance adjustments, stash migration, or changes to Forge odds.
- Pending rewards are not the same thing as claimed but still-risked rewards: the warning counts only **unselected** rewards, not selected skills or Embers.

## Tests
New Playwright coverage in desktop, mobile landscape, and iPhone Safari for:
1. Warden with an unclaimed reward: warning before Finish, 0 Embers secured and an explicit forfeiture message after.
2. Waystone with an unclaimed Cache reward: warning before channel, explicit forfeiture message after extraction.
3. Warden Ember selected before Finish: warning disappears, Ember secures normally.

## Relationship to M06 PR01
This standalone bug/clarity fix branches from `main` and does not modify PR #30. Merge in a controlled order after both branches pass CI; no forced merges.
