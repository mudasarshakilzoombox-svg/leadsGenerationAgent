// Dashboard smoke flow (ADR-0035/0036, WS-06): the main signed-in screens render on every
// project with no console errors and no sideways scrolling.
import { expect, expectNoHorizontalOverflow, OWNER_STATE, SEED, test } from './fixtures';

test.use({ storageState: OWNER_STATE });

const SCREENS: Array<[name: string, path: string, heading: RegExp]> = [
  ['dashboard', '', /.+/],
  ['sent', '/sent', /^Sent$/],
  ['email sequences', '/sequences', /^Email sequences$/],
  ['settings', '/settings', /^Settings$/],
];

for (const [name, path, heading] of SCREENS) {
  test(`${name} renders`, async ({ page }) => {
    await page.goto(`/${SEED.workspace}${path}`);
    await expect(page.getByRole('heading', { level: 1, name: heading }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test('settings shows workspace and profile tabs', async ({ page }) => {
  await page.goto(`/${SEED.workspace}/settings`);
  await expect(page.getByText('Postal address').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Profile' }).click();
  await expect(page.getByText('Your details')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
