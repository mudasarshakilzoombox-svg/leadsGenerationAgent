// Shared e2e fixtures: the seeded accounts (dev seed / CI seed) and helpers that keep every spec
// honest about console errors and horizontal overflow (PRD §10).
import { expect, type Page, test as base } from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3300';

/** Saved session of the seeded Owner, written by auth.setup.ts (git-ignored). */
export const OWNER_STATE = 'e2e/.auth/owner.json';

export const SEED = {
  owner: 'olivia.owner@acme-growth.test',
  password: 'lga-local-dev-password',
  workspace: 'acme-growth',
} as const;

/** Signs in through the API (same cookies as the UI flow, much faster). */
export async function signIn(page: Page, email: string = SEED.owner): Promise<void> {
  const res = await page.request.post('/api/v1/auth/login', {
    data: { email, password: SEED.password },
    headers: { origin: new URL(BASE_URL).origin, 'x-requested-with': 'lga-web' },
  });
  expect(res.status(), `login for ${email}`).toBe(200);
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1);
}

/**
 * Fails the test when the page logs a console error or throws (checked after each test).
 * A test that provokes an error on purpose (e.g. a 401 for a wrong password) lists it in
 * `allowedConsole` first.
 */
export const test = base.extend<{ allowedConsole: RegExp[]; consoleErrors: string[] }>({
  allowedConsole: async ({}, use) => {
    await use([]);
  },
  consoleErrors: [
    async ({ page, allowedConsole }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      await use(errors);
      const unexpected = errors.filter((e) => !allowedConsole.some((re) => re.test(e)));
      expect(unexpected, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
