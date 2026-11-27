// The API's route table, read from Nest decorator metadata. One source for the route-security
// test (TM-01), the OpenAPI document and its drift test (ADR-0039).
import 'reflect-metadata';
import { RequestMethod, type Type } from '@nestjs/common';
import { AuthController } from '../auth/auth.controller.js';
import { OAuthController } from '../auth/oauth.controller.js';
import { ProfileController } from '../auth/profile.controller.js';
import {
  ALLOW_RESTRICTED_WORKSPACE,
  IS_PUBLIC,
  REQUIRE_RECENT_AUTH,
  REQUIRE_VERIFIED_EMAIL,
  REQUIRED_PERMISSIONS,
  SELF_SERVICE,
} from '../auth/request-context.js';
import { TenantGuard } from '../auth/tenant.guard.js';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor.js';
import { DashboardController } from '../dashboard/dashboard.controller.js';
import { HealthController } from '../health/health.controller.js';
import { SystemController } from '../system/system.controller.js';
import {
  InvitationAcceptController,
  InvitationsController,
  MembersController,
  WorkspacesController,
} from '../workspaces/workspaces.controller.js';

/** Every controller registered by the API. A new controller must be added here. */
export const CONTROLLERS: Type[] = [
  AuthController,
  OAuthController,
  ProfileController,
  WorkspacesController,
  MembersController,
  InvitationsController,
  InvitationAcceptController,
  DashboardController,
  HealthController,
  SystemController,
];

export interface ApiRoute {
  /** `METHOD path`, e.g. `PATCH workspaces/:workspaceId`. */
  key: string;
  method: string;
  /** Without the global prefix and without leading/trailing slashes. */
  path: string;
  /** Explicit `@HttpCode`, otherwise Nest's default (201 for POST, 200 otherwise). */
  status: number;
  isPublic: boolean;
  tenantGuarded: boolean;
  permissions: string[];
  selfService: boolean;
  declaresPermission: boolean;
  recentAuthSeconds: number | undefined;
  verifiedEmail: boolean;
  idempotent: boolean;
  allowRestricted: boolean;
}

function meta<T>(key: string, target: object): T | undefined {
  return Reflect.getMetadata(key, target) as T | undefined;
}

export function apiRoutes(): ApiRoute[] {
  return CONTROLLERS.flatMap((controller) => {
    const base = String(meta<string>('path', controller) ?? '').replace(/^\/|\/$/g, '');
    const classGuards = meta<unknown[]>('__guards__', controller) ?? [];
    const classInterceptors = meta<unknown[]>('__interceptors__', controller) ?? [];
    return Object.getOwnPropertyNames(controller.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => (controller.prototype as unknown as Record<string, object>)[name]!)
      .filter((handler) => meta('path', handler) !== undefined)
      .map((handler): ApiRoute => {
        const method = RequestMethod[meta<number>('method', handler) ?? 0]!;
        const sub = String(meta<string>('path', handler)).replace(/^\/|\/$/g, '');
        const path = [base, sub].filter(Boolean).join('/');
        const guards = [...classGuards, ...(meta<unknown[]>('__guards__', handler) ?? [])];
        const interceptors = [
          ...classInterceptors,
          ...(meta<unknown[]>('__interceptors__', handler) ?? []),
        ];
        const permissions =
          meta<string[]>(REQUIRED_PERMISSIONS, handler) ??
          meta<string[]>(REQUIRED_PERMISSIONS, controller) ??
          [];
        const selfService = Boolean(meta(SELF_SERVICE, handler));
        return {
          key: `${method} ${path}`,
          method,
          path,
          status: meta<number>('__httpCode__', handler) ?? (method === 'POST' ? 201 : 200),
          isPublic: Boolean(meta(IS_PUBLIC, handler) ?? meta(IS_PUBLIC, controller)),
          tenantGuarded: guards.includes(TenantGuard),
          permissions,
          selfService,
          declaresPermission: permissions.length > 0 || selfService,
          recentAuthSeconds:
            meta<number>(REQUIRE_RECENT_AUTH, handler) ??
            meta<number>(REQUIRE_RECENT_AUTH, controller),
          verifiedEmail: Boolean(
            meta(REQUIRE_VERIFIED_EMAIL, handler) ?? meta(REQUIRE_VERIFIED_EMAIL, controller),
          ),
          idempotent: interceptors.includes(IdempotencyInterceptor),
          allowRestricted: Boolean(meta(ALLOW_RESTRICTED_WORKSPACE, handler)),
        };
      });
  });
}
