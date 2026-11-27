// Route-table security check (threat model TM-01): every route is either explicitly @Public() or
// session-guarded (global default), every /workspaces/:workspaceId route runs TenantGuard, and
// every mutating tenant route declares @RequirePermission() or @SelfService().
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/openapi/route-table.js';

/** Routes that are intentionally reachable without a session. */
const EXPECTED_PUBLIC = [
  'POST auth/signup',
  'POST auth/verify-email',
  'POST auth/verify-email/resend',
  'POST auth/login',
  'POST auth/password/forgot',
  'POST auth/password/reset',
  // Google / Microsoft sign-in (AUTH-03): the callback and link steps run before a session exists.
  'GET auth/providers',
  'GET auth/oauth/:provider/start',
  'GET auth/oauth/:provider/callback',
  'GET auth/oauth/link',
  'POST auth/oauth/link',
  'POST auth/oauth/link/confirm',
  'GET auth/oauth/fake/:provider',
  'GET auth/oauth/fake/:provider/authorize',
  // Email change links are opened from an inbox, possibly signed out (AUTH-06).
  'POST auth/email/confirm',
  'POST auth/email/revert',
  'GET invitations/lookup',
  'GET health/live',
  'GET health/ready',
  'GET system/info',
].sort();

describe('route security table', () => {
  const all = apiRoutes();

  it('discovers the routes', () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it('exposes exactly the expected public routes', () => {
    expect(
      all
        .filter((r) => r.isPublic)
        .map((r) => r.key)
        .sort(),
    ).toEqual(EXPECTED_PUBLIC);
  });

  it.each(
    all.filter((r) => r.path.startsWith('workspaces/:workspaceId')).map((r) => [r.key, r] as const),
  )('%s runs TenantGuard', (_key, route) => {
    expect(route.tenantGuarded).toBe(true);
    expect(route.isPublic).toBe(false);
  });

  it.each(
    all
      .filter((r) => r.path.startsWith('workspaces/:workspaceId') && r.method !== 'GET')
      .map((r) => [r.key, r] as const),
  )('%s declares a permission', (_key, route) => {
    expect(route.declaresPermission).toBe(true);
  });
});
