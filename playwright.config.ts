import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  timeout: 45000,
  // Phaser/WebGL scenes are CPU-heavy on shared CI runners. Running browser
  // tests one at a time keeps frame-based encounters and touch checks stable.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1024, height: 768 } } },
    { name: 'mobile-landscape', use: { browserName: 'chromium', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
    { name: 'iphone-safari', use: { browserName: 'webkit', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } }
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/ashen-depths/',
    env: { ...process.env, GITHUB_PAGES: 'true' },
    reuseExistingServer: !process.env.CI,
    timeout: 60000
  }
});
