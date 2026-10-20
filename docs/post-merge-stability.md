# Post-Merge Stabilization — PR30 + PR31

## CI failures investigated
- PR30 final CI (run 39356493958) was red despite 113/114 passing. The original stash regression repeatedly failed on different phases and the latest single failure was Safari cache-discovery timing.
- PR31 CI (run 39355665497) had 118/120 passing; its failures were the long stash-withdrawal test on mobile landscape and Safari. These reports predated the later touch improvements merged in PR30.
- Both PRs were manually merged. This follow-up targets the shared stash/restart reliability and the slow full browser CI rather than adding gameplay features.

## Changes
1. **Separate deterministic persistence tests.** Existing Warden test checks real combat, loot collection, and completed extraction. A second test seeds known, valid schema-1 equipment once per browser session and independently checks stash withdrawal, risked bag ownership, and persistent loss on page reload.
2. **Visible withdrawal failure.** Stash withdrawal now returns a transaction result and warns if an item cannot be withdrawn (storage quota, stale data, unavailable camp) instead of silently leaving both panels unchanged. This does not relax the safe-stash or extraction rules. Added an E2E test injecting a storage-write failure and verifying safe retry without duplication.
3. **Accurate build identification.** Game title identifies the stabilization update after M06 PR01.
4. **Parallel CI by browser** with separate desktop Chromium, mobile landscape Chromium, and iPhone Safari WebKit jobs (each one isolated worker, retaining the CPU-safe tests). Unit/type/build verification gates all E2E jobs. Browser failures now retain downloadable screenshots and traces for 7 days, so repeated failures can be investigated with real evidence.
5. **No saved-data migration or balancing changes.** 25/20/55 Forge outcomes, lifetime item lock, next-run Ember spendability, skill unlocks, hybrid affix tiers and reward-forfeiture UI remain intact.

## Acceptance
- [ ] TypeScript, Vitest, Pages production build, manifest checks all green.
- [ ] Three browser matrix jobs independently green, including Safari and landscape.
- [ ] Failed withdrawal leaves secured item intact, shows explanatory message, and a successful retry transfers it exactly once.
- [ ] Warden finishing still saves bag + equipped loot; fresh expedition shows secured gear.
- [ ] Withdrawal remains lost on actual page reload before extraction; old remaining stash items persist.
- [ ] Manual iPhone run: claim Forge Ember via CLAIM REWARDS, Finish, new expedition sees banked and spendable Ember.
- [ ] No merge until owner approval.
