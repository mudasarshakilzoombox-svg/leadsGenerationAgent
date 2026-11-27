import { Injectable } from '@nestjs/common';
import {
  PhysicalAddressSchema,
  type RoleKeyValue,
  type UpdateWorkspaceRequest,
  type WorkspaceDetail,
} from '@lga/contracts';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainError } from '../../../errors/domain-error.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { staleVersion } from '../../../platform/http/etag.js';
import { resolvePermissions } from '../../../platform/tenancy/permissions.js';
import type { WorkspaceAccess } from '../../../tenancy/workspace-access.service.js';
import { parseWorkspaceSettings } from '../../../tenancy/workspace-settings.js';
import { AuditService, type RequestMeta } from '../../audit/index.js';
import { launchReadiness } from '../domain/launch-readiness.js';
import { toWorkspaceSummary } from './workspace.service.js';

export const workspaceDetailSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  planKey: true,
  trialEndsAt: true,
  defaultTimezone: true,
  createdAt: true,
  legalName: true,
  physicalAddress: true,
  privacyNoticeUrl: true,
  settings: true,
  rowVersion: true,
  deletionRequestedAt: true,
  purgeAfter: true,
} as const satisfies Prisma.WorkspaceSelect;

type DetailRow = Prisma.WorkspaceGetPayload<{ select: typeof workspaceDetailSelect }>;

/** The workspace as its members see it, with effective permissions for `roleKey`. */
export function toWorkspaceDetail(row: DetailRow, roleKey: string): WorkspaceDetail {
  const settings = parseWorkspaceSettings(row.settings);
  const address = PhysicalAddressSchema.safeParse(row.physicalAddress);
  return {
    ...toWorkspaceSummary(row),
    legalName: row.legalName,
    physicalAddress: address.success ? address.data : null,
    privacyNoticeUrl: row.privacyNoticeUrl,
    defaultSendWindow: settings.defaultSendWindow,
    launchRequiresApproval: settings.launchRequiresApproval,
    launchReadiness: launchReadiness(row),
    rowVersion: row.rowVersion,
    deletionRequestedAt: row.deletionRequestedAt?.toISOString() ?? null,
    purgeAfter: row.purgeAfter?.toISOString() ?? null,
    roleKey: roleKey as RoleKeyValue,
    permissions: [...resolvePermissions(roleKey, settings)].sort(),
  };
}

/**
 * Workspace settings (PRD WS-06). `workspaces` is a global model, so it is read and written by
 * id through the base client; TenantGuard has already verified the caller's membership.
 * Writes are optimistic: the row version from `If-Match` must still be current (03-api §7).
 */
@Injectable()
export class WorkspaceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(access: WorkspaceAccess): Promise<WorkspaceDetail> {
    const row = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: access.workspaceId },
      select: workspaceDetailSelect,
    });
    return toWorkspaceDetail(row, access.roleKey);
  }

  async update(
    access: WorkspaceAccess,
    expectedVersion: number,
    input: UpdateWorkspaceRequest,
    meta: RequestMeta,
  ): Promise<WorkspaceDetail> {
    const changed = Object.keys(input).filter(
      (k) => input[k as keyof UpdateWorkspaceRequest] !== undefined,
    );
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.workspace.findUnique({
        where: { id: access.workspaceId },
        select: { rowVersion: true, settings: true },
      });
      if (!current) throw new DomainError('NOT_FOUND', 'Workspace not found.');
      if (current.rowVersion !== expectedVersion) throw staleVersion();

      const rawSettings =
        current.settings && typeof current.settings === 'object' && !Array.isArray(current.settings)
          ? current.settings
          : {};
      const settings: Prisma.JsonObject = { ...rawSettings };
      if (input.launchRequiresApproval !== undefined) {
        settings.launchRequiresApproval = input.launchRequiresApproval;
      }
      if (input.defaultSendWindow !== undefined) {
        settings.defaultSendWindow = input.defaultSendWindow;
      }

      const { count } = await tx.workspace.updateMany({
        where: { id: access.workspaceId, rowVersion: expectedVersion, deletedAt: null },
        data: {
          ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
          ...(input.physicalAddress !== undefined
            ? { physicalAddress: input.physicalAddress ?? Prisma.DbNull }
            : {}),
          ...(input.privacyNoticeUrl !== undefined
            ? { privacyNoticeUrl: input.privacyNoticeUrl }
            : {}),
          ...(input.defaultTimezone !== undefined
            ? { defaultTimezone: input.defaultTimezone }
            : {}),
          settings,
          rowVersion: { increment: 1 },
        },
      });
      if (count === 0) throw staleVersion();

      await this.audit.record(
        {
          action: 'workspace.settings_updated',
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          targetType: 'workspace',
          targetId: access.workspaceId,
          // Field names only: addresses and links stay out of the audit trail.
          metadata: {
            fields: changed.sort().join(','),
            ...(input.launchRequiresApproval !== undefined
              ? { launchRequiresApproval: input.launchRequiresApproval }
              : {}),
          },
        },
        meta,
        tx,
      );
      const row = await tx.workspace.findUniqueOrThrow({
        where: { id: access.workspaceId },
        select: workspaceDetailSelect,
      });
      return toWorkspaceDetail(row, access.roleKey);
    });
  }
}
