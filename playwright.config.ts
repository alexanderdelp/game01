import { defineConfig } from '@playwright/test';

// Eigener Port per E2E_PORT, damit parallele Sessions nicht den Server einer anderen mitbenutzen
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Jeder Test hat eigenen Browser-Kontext (eigener Speicher) und Netz-Tests eigene Server-Ports → parallel möglich
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  // Der CI-Rechner ist deutlich langsamer; ein einzelner Zeit-Ausreißer soll den Deploy nicht verhindern
  retries: process.env.CI ? 1 : 0,
  // 960 × 540: gleicher Weltausschnitt (M27, Zoom 1) bei halber Pixelzahl → deutlich weniger Rechenzeit fürs Zeichnen
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 960, height: 540 } },
  webServer: { command: `npx vite preview --port ${port} --strictPort`, port, reuseExistingServer: !process.env.E2E_PORT },
});
