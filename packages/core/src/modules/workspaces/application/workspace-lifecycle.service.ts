import { Inject, Injectable } from '@nestjs/common';
import type { WorkspaceDetail } from '@lga/contracts';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainError } from '../../../errors/domain-error.js';
import type { WorkspaceStatus } from '../../../generated/prisma/client.js';
import type { WorkspaceAccess } from '../../../tenancy/workspace-access.service.js';
import { AuditService, type RequestMeta } from '../../audit/audit.service.js';
import {
  WORKSPACE_LIFECYCLE_HOOKS,
  type WorkspaceLifecycleHooks,
} from './workspace-lifecycle-hooks.js';
import { toWorkspaceDetail, workspaceDetailSelect } from './workspace-settings.service.js';

/** PRD WS-07 AC2: data is kept 30 days after a deletion request, then purged. */
export const DELETION_GRACE_DAYS = 30;

const DELETABLE: readonly WorkspaceStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'READ_ONLY'];

/**
 * Delete with a 30-day restore window (PRD WS-07, 09-multi-tenancy §7, ADR-0038).
 * PENDING_DELETION blocks writes (TenantGuard) and sending (SendPolicy SP-01) at once; the
 * `workspace-purge-due` reconciler removes the data once `purge_after` has passed.
 */
@Injectable()
export class WorkspaceLifecycleService {
  constructor(
    @InjectPinoLogger(WorkspaceLifecycleService.name) private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(WORKSPACE_LIFECYCLE_HOOKS) private readonly hooks: WorkspaceLifecycleHooks,
  ) {}

  async requestDeletion(
    access: WorkspaceAccess,
    confirmName: string,
    meta: RequestMeta,
  ): Promise<WorkspaceDetail> {
    const detail = await this.prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.findUniqueOrThrow({
        where: { id: access.workspaceId },
        select: { name: true, status: true },
      });
      if (confirmName.trim() !== ws.name.trim()) {
        throw new DomainError('VALIDATION_FAILED', 'Type the workspace name exactly to confirm.', {
          errors: [
            {
              pointer: '/confirmName',
              code: 'mismatch',
              message: 'Type the workspace name exactly to confirm.',
            },
          ],
        });
      }
      if (!DELETABLE.includes(ws.status)) {
        throw new DomainError(
          'ILLEGAL_STATE_TRANSITION',
          'This workspace is already scheduled for deletion.',
        );
      }
      const now = new Date();
      const { count } = await tx.workspace.updateMany({
        where: { id: access.workspaceId, status: ws.status, deletedAt: null },
        data: {
          status: 'PENDING_DELETION',
          statusBeforeDeletion: ws.status,
          deletionRequestedAt: now,
          purgeAfter: new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000),
          rowVersion: { increment: 1 },
        },
      });
      if (count === 0) {
        throw new DomainError('CONFLICT', 'The workspace changed meanwhile. Reload and try again.');
      }
      await this.audit.record(
        {
          action: 'workspace.deletion_requested',
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          targetType: 'workspace',
          targetId: access.workspaceId,
          metadata: { previousStatus: ws.status, graceDays: DELETION_GRACE_DAYS },
        },
        meta,
        tx,
      );
      return this.detail(tx, access);
    });
    await this.runHook('onDeletionRequested', access.workspaceId);
    return detail;
  }

  async restore(access: WorkspaceAccess, meta: RequestMeta): Promise<WorkspaceDetail> {
    const detail = await this.prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.findUniqueOrThrow({
        where: { id: access.workspaceId },
        select: { status: true, statusBeforeDeletion: true, purgeAfter: true },
      });
      if (ws.status !== 'PENDING_DELETION') {
        throw new DomainError('ILLEGAL_STATE_TRANSITION', 'This workspace is not being deleted.');
      }
      const now = new Date();
      if (!ws.purgeAfter || ws.purgeAfter <= now) {
        throw new DomainError(
          'ILLEGAL_STATE_TRANSITION',
          'The 30-day restore window has ended for this workspace.',
        );
      }
      const restoredStatus: WorkspaceStatus = ws.statusBeforeDeletion ?? 'ACTIVE';
      const { count } = await tx.workspace.updateMany({
        where: {
          id: access.workspaceId,
          status: 'PENDING_DELETION',
          purgeAfter: { gt: now },
          deletedAt: null,
        },
        data: {
          status: restoredStatus,
          statusBeforeDeletion: null,
          deletionRequestedAt: null,
          purgeAfter: null,
          rowVersion: { increment: 1 },
        },
      });
      if (count === 0) {
        throw new DomainError('CONFLICT', 'The workspace changed meanwhile. Reload and try again.');
      }
      await this.audit.record(
        {
          action: 'workspace.restored',
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          targetType: 'workspace',
          targetId: access.workspaceId,
          metadata: { restoredStatus },
        },
        meta,
        tx,
      );
      return this.detail(tx, access);
    });
    await this.runHook('onRestored', access.workspaceId);
    return detail;
  }

  private async detail(
    tx: Pick<PrismaService, 'workspace'>,
    access: WorkspaceAccess,
  ): Promise<WorkspaceDetail> {
    const row = await tx.workspace.findUniqueOrThrow({
      where: { id: access.workspaceId },
      select: workspaceDetailSelect,
    });
    return toWorkspaceDetail(row, access.roleKey);
  }

  private async runHook(
    name: 'onDeletionRequested' | 'onRestored',
    workspaceId: string,
  ): Promise<void> {
    try {
      await this.hooks[name](workspaceId);
    } catch (error) {
      this.logger.warn({ workspaceId, hook: name, err: error }, 'Workspace lifecycle hook failed');
    }
  }
}
