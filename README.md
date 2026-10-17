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

`main` deploys through GitHub Actions to GitHub Pages once Pages is configured to use **GitHub Actions** in repository settings. Pull requests run CI but do not deploy to the public site.

## Scope

M01 / PR01 is intentionally a minimal game shell. Click/tap movement, navigation, procedural rooms, combat, and persistence follow in later PRs. See `docs/architecture.md`.
