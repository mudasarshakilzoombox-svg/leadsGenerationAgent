// Signs the seeded Owner in once per run and saves the session for the signed-in specs, so the
// suite stays far below the API's per-IP sign-in rate limit (10 per minute).
import { test as setup } from '@playwright/test';
import { OWNER_STATE, signIn } from './fixtures';

setup('sign in as the seeded Owner', async ({ page }) => {
  await signIn(page);
  await page.context().storageState({ path: OWNER_STATE });
});
