// Route-table security check (threat model TM-01): every route is either explicitly @Public() or
// session-guarded (global default), every /workspaces/:workspaceId route runs TenantGuard, and
// every mutating tenant route declares @RequirePermission() or @SelfService().
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthController } from '../src/auth/auth.controller.js';
import { DashboardController } from '../src/dashboard/dashboard.controller.js';
import { IS_PUBLIC, REQUIRED_PERMISSIONS, SELF_SERVICE } from '../src/auth/request-context.js';
import { TenantGuard } from '../src/auth/tenant.guard.js';
import { HealthController } from '../src/health/health.controller.js';
import { SystemController } from '../src/system/system.controller.js';
import {
  InvitationAcceptController,
  InvitationsController,
  MembersController,
  WorkspacesController,
} from '../src/workspaces/workspaces.controller.js';

const CONTROLLERS = [
  AuthController,
  WorkspacesController,
  MembersController,
  InvitationsController,
  InvitationAcceptController,
  DashboardController,
  HealthController,
  SystemController,
];

/** Routes that are intentionally reachable without a session. */
const EXPECTED_PUBLIC = [
  'POST auth/signup',
  'POST auth/verify-email',
  'POST auth/verify-email/resend',
  'POST auth/login',
  'POST auth/password/forgot',
  'POST auth/password/reset',
  'GET invitations/lookup',
  'GET health/live',
  'GET health/ready',
  'GET system/info',
].sort();

interface Route {
  key: string;
  method: string;
  path: string;
  isPublic: boolean;
  tenantGuarded: boolean;
  declaresPermission: boolean;
}

function meta<T>(key: string, target: object): T | undefined {
  return Reflect.getMetadata(key, target) as T | undefined;
}

function routes(): Route[] {
  return CONTROLLERS.flatMap((controller) => {
    const base = String(meta<string>('path', controller) ?? '').replace(/^\/|\/$/g, '');
    const classGuards = meta<unknown[]>('__guards__', controller) ?? [];
    return Object.getOwnPropertyNames(controller.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => (controller.prototype as unknown as Record<string, object>)[name]!)
      .filter((handler) => meta('path', handler) !== undefined)
      .map((handler) => {
        const method = RequestMethod[meta<number>('method', handler) ?? 0]!;
        const sub = String(meta<string>('path', handler)).replace(/^\/|\/$/g, '');
        const path = [base, sub].filter(Boolean).join('/');
        const guards = [...classGuards, ...(meta<unknown[]>('__guards__', handler) ?? [])];
        return {
          key: `${method} ${path}`,
          method,
          path,
          isPublic: Boolean(meta(IS_PUBLIC, handler) ?? meta(IS_PUBLIC, controller)),
          tenantGuarded: guards.includes(TenantGuard),
          declaresPermission: Boolean(
            meta(REQUIRED_PERMISSIONS, handler) ??
            meta(REQUIRED_PERMISSIONS, controller) ??
            meta(SELF_SERVICE, handler),
          ),
        };
      });
  });
}

describe('route security table', () => {
  const all = routes();

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
