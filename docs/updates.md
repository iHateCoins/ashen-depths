# Updating the iPhone Home Screen web app

Ashen Depths is a browser-based game hosted at https://ihatecoins.github.io/ashen-depths/.

## How updates work

- Every GitHub Actions production build embeds its commit SHA in the JavaScript bundle and publishes the same SHA in `/ashen-depths/version.json`.
- While running, the game requests that file with `cache: 'no-store'` and a unique URL. A browser-cached copy of the app can therefore detect a newer deployment.
- **Freshly opened app:** automatically navigate to the latest URL with `?build=<commit-sha>`, defeating cached HTML without replacing the Home Screen icon.
- **Already playing:** offer **Update now** / **Later** when the web app is foregrounded or on its three-minute check; no surprise reload in combat.
- If an older cached bundle is still delivered for `?build=<latest>`, do not enter an infinite reload loop. Offer **Retry update** with another unique URL.
- Show a compact `Build abc1234` label in the game so testers can identify the actual running version.
- If the version endpoint cannot be reached, preserve the current playable game.
- No service worker, persistent offline cache, or backend required.

## One-time transition for already-installed shortcuts

Older builds (through M02 PR03) **do not contain this updater**, so they cannot discover it by themselves. On the first release of the update system, if an existing Home Screen icon still launches an old build, remove that icon, open the updated site in Safari, and use Share → Add to Home Screen once. Subsequent releases should update through the installed app.

## Test plan

- Unit tests cover build IDs, URL generation, no-update behavior, and reload-loop prevention.
- CI performs a Pages production build and checks its `version.json` matches the SHA embedded in JavaScript.
- Playwright tests in desktop Chromium, mobile Chromium, and WebKit validate automatic startup refresh and the no-loop manual prompt.
- Check the public site in Safari and standalone Home Screen mode after merging.

## Limitations

Browser and CDN caching behavior varies by platform. GitHub Pages does not allow us to set custom cache-control headers, so the version query and a cache-busting launch URL are important. Installed versions from before this feature may need the one-time reinstall above.
