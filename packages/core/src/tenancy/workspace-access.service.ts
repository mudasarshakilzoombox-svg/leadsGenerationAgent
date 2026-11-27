import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { DomainError } from '../errors/domain-error.js';
import type { WorkspaceStatus } from '../generated/prisma/client.js';
import { resolvePermissions, type WorkspacePermission } from '../platform/tenancy/permissions.js';
import { createTenantClient, type TenantClient } from './tenant-client.js';
import { parseWorkspaceSettings, type WorkspaceSettings } from './workspace-settings.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WorkspaceAccess {
  workspaceId: string;
  userId: string;
  membershipId: string;
  roleKey: string;
  workspace: { id: string; name: string; status: WorkspaceStatus; planKey: string };
  settings: WorkspaceSettings;
  permissions: ReadonlySet<WorkspacePermission>;
  can(permission: WorkspacePermission): boolean;
  /** Prisma client confined to this workspace. */
  db: TenantClient;
}

/**
 * The only way to obtain tenant data access for a user (backs the API's TenantGuard).
 * Non-members, unknown ids and closed or deleted workspaces all produce the same 404,
 * so a caller cannot probe which workspaces exist (SECURITY.md §3.3).
 */
@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string, workspaceId: string): Promise<WorkspaceAccess> {
    if (!UUID.test(userId) || !UUID.test(workspaceId)) throw workspaceNotFound();

    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: {
        id: true,
        roleKey: true,
        user: { select: { deletedAt: true } },
        workspace: {
          select: {
            id: true,
            name: true,
            status: true,
            planKey: true,
            settings: true,
            deletedAt: true,
          },
        },
      },
    });
    if (
      !member ||
      member.user.deletedAt ||
      member.workspace.deletedAt ||
      member.workspace.status === 'CLOSED'
    ) {
      throw workspaceNotFound();
    }

    const settings = parseWorkspaceSettings(member.workspace.settings);
    const permissions = resolvePermissions(member.roleKey, settings);
    const { id, name, status, planKey } = member.workspace;
    return {
      workspaceId,
      userId,
      membershipId: member.id,
      roleKey: member.roleKey,
      workspace: { id, name, status, planKey },
      settings,
      permissions,
      can: (permission) => permissions.has(permission),
      db: createTenantClient(this.prisma, workspaceId),
    };
  }
}

function workspaceNotFound(): DomainError {
  return new DomainError('NOT_FOUND', 'Workspace not found.');
}
