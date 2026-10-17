# Architecture baseline

- Browser-native, true overhead 2D, hand-painted art, hybrid animation.
- Phaser 3 renders and handles input; gameplay systems should be separately testable.
- Continuous procedural branching dungeons with click/tap-to-move.
- Automatic attacks and abilities; extraction secures expedition loot.
- Use seeded generation and versioned IndexedDB persistence in later milestones.

## M01 PR01 acceptance

- [ ] Vite + TypeScript build passes
- [ ] Vitest smoke test passes
- [ ] Phaser boot scene renders on desktop/mobile viewport
- [ ] GitHub Actions CI passes on PR
- [ ] GitHub Pages workflow deploys after merge and repository Pages setup

PR01 does not include movement, navigation, or combat.
