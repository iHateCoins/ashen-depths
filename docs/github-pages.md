# GitHub Pages release troubleshooting

**Required configuration:** In repository **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**, not **Deploy from a branch**.

This repository contains a Vite/TypeScript game. GitHub's legacy **pages build and deployment** (Jekyll) workflow can successfully publish raw source files, but browsers cannot run `/src/main.ts` as a compiled application. The repository also includes **Deploy GitHub Pages**, which builds and deploys `dist/`. If both workflows run, they can overwrite one another.

The correct workflow is **Deploy GitHub Pages** and it must publish the compiled Vite `dist` output.

## How to verify
1. Go to **Settings → Pages**; Source should be **GitHub Actions**.
2. Open **Actions → Deploy GitHub Pages** and check for a successful deployment.
3. Open https://ihatecoins.github.io/ashen-depths/ and verify the dungeon renders.
4. Use Safari → Share → Add to Home Screen for phone testing.

## Automated checks
- CI compiles the Pages build and launches it in desktop and mobile Chromium with Playwright.
- Deployment verifies `dist/index.html` references compiled assets.
- The Pages deployment workflow fetches the published URL and confirms it serves a compiled JavaScript bundle.
- A startup status panel gives a useful error instead of a blank white page if the client can't boot.

**Note:** A completed GitHub Actions deployment cannot permanently override an incorrectly enabled branch/Jekyll source. The Settings change is required.
