import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError, WorkspaceAccessService, type WorkspacePermission } from '@lga/core';
import { type AuthedRequest, REQUIRED_PERMISSIONS } from './request-context.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const WRITE_RESTRICTED = new Set(['READ_ONLY', 'PENDING_DELETION']);

/**
 * Tenant routes (`/workspaces/:workspaceId/...`, 09-multi-tenancy.md §3):
 * 1. The workspace comes from the path and the user from the session, never from the body.
 * 2. Non-members, unknown ids and closed workspaces get 404 (before any permission check,
 *    so outsiders cannot tell a forbidden workspace from a missing one).
 * 3. Writes to a READ_ONLY or PENDING_DELETION workspace get 403 WORKSPACE_RESTRICTED.
 * 4. `@RequirePermission(...)` is checked against the caller's role, resolved per request.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: WorkspaceAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.');
    const workspaceId = req.params.workspaceId;
    if (typeof workspaceId !== 'string')
      throw new Error('TenantGuard used on a route without :workspaceId');

    const access = await this.access.forUser(req.auth.userId, workspaceId);
    if (!SAFE_METHODS.has(req.method) && WRITE_RESTRICTED.has(access.workspace.status)) {
      throw new DomainError('WORKSPACE_RESTRICTED', 'This workspace is read-only right now.');
    }
    const required =
      this.reflector.getAllAndOverride<WorkspacePermission[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.some((permission) => !access.can(permission))) {
      throw new DomainError('PERMISSION_DENIED', 'Your role does not allow this action.');
    }
    req.workspaceAccess = access;
    return true;
  }
}
