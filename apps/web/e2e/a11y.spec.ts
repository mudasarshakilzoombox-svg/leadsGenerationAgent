// Accessibility gate (01-frontend §13): axe on the main pages, failing on serious or critical
// violations against WCAG 2.1 A/AA.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, OWNER_STATE, SEED, test } from './fixtures';

async function expectAccessible(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => ({
        target: n.target.join(' '),
        html: n.html.slice(0, 160),
        why: n.failureSummary?.split('\n').slice(-1)[0],
      })),
    }));
  expect(blocking, 'serious or critical accessibility violations').toEqual([]);
}

for (const path of ['/login', '/signup', '/forgot-password']) {
  test(`${path} has no serious accessibility issues`, async ({ page }) => {
    await page.goto(path);
    await page.getByRole('main').waitFor();
    await expectAccessible(page);
  });
}

test.describe('signed in', () => {
  test.use({ storageState: OWNER_STATE });
  for (const path of ['', '/settings', '/sequences']) {
    test(`/${SEED.workspace}${path} has no serious accessibility issues`, async ({ page }) => {
      await page.goto(`/${SEED.workspace}${path}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await expectAccessible(page);
    });
  }
});
