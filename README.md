# Ashen Depths

Browser-based dark-fantasy top-down ARPG/roguelike. Phaser 3 + TypeScript + Vite.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## Deployment

**Required:** In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**, not **Deploy from a branch**. The Pages/Jekyll branch publisher will otherwise publish raw TypeScript files, producing a blank page even if the separate game-build workflow succeeds.\n\n`main` deploys the compiled Vite `dist/` bundle through **Deploy GitHub Pages**. Pull requests run CI and a browser-launch test but do not deploy to the public site. See `docs/github-pages.md` for troubleshooting.

## Scope

M01 / PR01 is intentionally a minimal game shell. Click/tap movement, navigation, procedural rooms, combat, and persistence follow in later PRs. See `docs/architecture.md`.
