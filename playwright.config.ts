import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  // Der CI-Rechner ist deutlich langsamer; ein einzelner Zeit-Ausreißer soll den Deploy nicht verhindern
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: true },
});
