// Auth smoke flow (PRD AUTH-01..03) on desktop and mobile viewports.
import { expect, expectNoHorizontalOverflow, SEED, test } from './fixtures';

test.describe('sign in', () => {
  test('shows the sign-in page with both providers', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue with Microsoft' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('rejects a wrong password, then signs the Owner in and out', async ({
    page,
    allowedConsole,
  }, info) => {
    // The wrong password is a 401 on purpose; the browser logs failed requests as errors.
    allowedConsole.push(/status of 401/);
    await page.goto('/login');
    // A throwaway address: failed attempts never count against the shared seeded Owner.
    await page.getByLabel('Work email').fill(`nobody-${Date.now()}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill('not the password 123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/incorrect|didn.t match|wrong/i).first()).toBeVisible();

    await page.getByLabel('Work email').fill(SEED.owner);
    await page.getByLabel('Password', { exact: true }).fill(SEED.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(`**/${SEED.workspace}`);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // The account menu lives in the desktop sidebar; mobile uses the same session API.
    if (info.project.name === 'desktop-chrome') {
      await page.getByRole('button', { name: new RegExp(SEED.owner.replace('.', '\\.')) }).click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
      await page.waitForURL('**/login**');
      await page.goto(`/${SEED.workspace}`);
      await page.waitForURL('**/login**');
    }
  });

  test('validates the sign-up form before calling the API', async ({ page }) => {
    await page.goto('/signup');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(/email/i).first()).toBeVisible();
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('creates an account through the fake Google sign-in page', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Continue with Google' }).click();
    await page
      .locator('input[name="email"]')
      .fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL('**/workspaces');
    await expectNoHorizontalOverflow(page);
  });
});
