import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 90_000, expect: { timeout: 10_000 }, workers: 1, fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'edge', use: { channel: 'msedge' } },
  ],
  webServer: {
    command: 'node scripts/serve-fixtures.mjs',
    url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 60_000,
  },
});
