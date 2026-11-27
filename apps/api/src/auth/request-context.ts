import {
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  type PipeTransform,
  SetMetadata,
} from '@nestjs/common';
import {
  type ActiveSession,
  DomainError,
  type RequestMeta,
  type WorkspaceAccess,
  type WorkspacePermission,
} from '@lga/core';
import type { Request } from 'express';

/** What the guards attach to the request. Never read workspace or role from the body. */
export interface AuthedRequest extends Request {
  auth?: ActiveSession;
  workspaceAccess?: WorkspaceAccess;
}

export const IS_PUBLIC = 'lga:isPublic';
export const REQUIRED_PERMISSIONS = 'lga:requiredPermissions';
export const REQUIRE_VERIFIED_EMAIL = 'lga:requireVerifiedEmail';
export const REQUIRE_RECENT_AUTH = 'lga:requireRecentAuth';
export const SELF_SERVICE = 'lga:selfService';

/** Opt out of the global session requirement (signup, login, health, ...). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Checked by TenantGuard against the caller's role in the route's workspace. */
export const RequirePermission = (...permissions: WorkspacePermission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
/** PRD AUTH-02 AC3: unverified users cannot do this. */
export const RequireVerifiedEmail = () => SetMetadata(REQUIRE_VERIFIED_EMAIL, true);
/** 08-authentication.md §7: the password must have been entered within `seconds`. */
export const RequireRecentAuth = (seconds = 600) => SetMetadata(REQUIRE_RECENT_AUTH, seconds);
/**
 * Marks a mutating tenant route whose permission depends on the target (e.g. leaving a workspace
 * needs none, removing someone else needs `members.manage`). The service enforces it.
 */
export const SelfService = () => SetMetadata(SELF_SERVICE, true);

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActiveSession => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
    return req.auth;
  },
);

export const CurrentAccess = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceAccess => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.workspaceAccess) throw new Error('TenantGuard did not run for this route');
    return req.workspaceAccess;
  },
);

export function requestMeta(req: AuthedRequest): RequestMeta {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip,
    userAgent: typeof ua === 'string' ? ua : undefined,
    requestId: typeof req.id === 'string' ? req.id : undefined,
  };
}

export const Meta = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestMeta =>
  requestMeta(ctx.switchToHttp().getRequest<AuthedRequest>()),
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path ids that are not UUIDs are simply "not found" (no 400 that reveals the format). */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) throw new DomainError('NOT_FOUND', 'Not found.');
    return value;
  }
}
