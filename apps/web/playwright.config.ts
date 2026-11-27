// End-to-end and accessibility checks (01-frontend §13, ADR-0039). Runs against a running stack:
// `pnpm dev` locally (default http://localhost:3300) or the built stack in CI (E2E_BASE_URL).
// One browser (Chromium) for every project: the iPhone 14 project emulates its viewport and
// touch input, not WebKit (owner decision, ADR-0039).
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './e2e/fixtures';

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Dev servers compile pages on first visit.
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] }, dependencies: ['setup'] },
    {
      name: 'iphone-14',
      use: { ...devices['iPhone 14'], browserName: 'chromium' },
      dependencies: ['setup'],
    },
  ],
});
