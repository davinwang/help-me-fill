import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 90_000, expect: { timeout: 10_000 }, workers: 1, fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    // The extension localizes through chrome.i18n, which follows the browser UI
    // language. The harness matches English labels, so the browser locale is
    // pinned instead of inheriting whatever the host machine is set to.
    { name: 'chrome', use: { channel: 'chrome', locale: 'en-US' } },
    { name: 'edge', use: { channel: 'msedge', locale: 'en-US' } },
  ],
  webServer: {
    command: 'node scripts/serve-fixtures.mjs',
    url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 60_000,
  },
});
