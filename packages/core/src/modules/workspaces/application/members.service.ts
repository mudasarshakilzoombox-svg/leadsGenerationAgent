import { Injectable } from '@nestjs/common';
import type { AssignableRole, MemberSummary, RoleKeyValue } from '@lga/contracts';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainError } from '../../../errors/domain-error.js';
import type { WorkspaceAccess } from '../../../tenancy/workspace-access.service.js';
import { AuditService, type RequestMeta } from '../../audit/audit.service.js';

const memberSelect = {
  id: true,
  userId: true,
  roleKey: true,
  joinedAt: true,
  user: { select: { name: true, email: true } },
} as const;

type MemberRow = {
  id: string;
  userId: string;
  roleKey: string;
  joinedAt: Date;
  user: { name: string | null; email: string };
};

function toMemberSummary(m: MemberRow): MemberSummary {
  return {
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    roleKey: m.roleKey as RoleKeyValue,
    joinedAt: m.joinedAt.toISOString(),
  };
}

const memberNotFound = () => new DomainError('NOT_FOUND', 'Member not found.');

/**
 * Team management (PRD WS-04, WS-05). Every query goes through the tenant-scoped client of the
 * caller's verified membership, so a member id from another workspace is simply "not found".
 * The Owner is never changed or removed here, only through `transferOwnership`.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(access: WorkspaceAccess): Promise<MemberSummary[]> {
    const rows = await access.db.workspaceMember.findMany({
      select: memberSelect,
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map(toMemberSummary);
  }

  async changeRole(
    access: WorkspaceAccess,
    memberId: string,
    roleKey: AssignableRole,
    meta: RequestMeta,
  ): Promise<MemberSummary> {
    return access.db.$transaction(async (tx) => {
      const member = await tx.workspaceMember.findUnique({
        where: { id: memberId },
        select: memberSelect,
      });
      if (!member) throw memberNotFound();
      if (member.roleKey === 'OWNER') {
        throw new DomainError(
          'PERMISSION_DENIED',
          "The Owner's role changes only through an ownership transfer.",
        );
      }
      if (member.roleKey === roleKey) return toMemberSummary(member);
      const updated = await tx.workspaceMember.update({
        where: { id: memberId },
        data: { roleKey },
        select: memberSelect,
      });
      await this.audit.record(
        {
          action: 'member.role_changed',
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          targetType: 'workspace_member',
          targetId: memberId,
          metadata: { userId: member.userId, from: member.roleKey, to: roleKey },
        },
        meta,
        tx,
      );
      return toMemberSummary(updated);
    });
  }

  /**
   * Removes a member (needs `members.manage`) or lets a member leave (no permission needed).
   * Their mailboxes are paused and reassigned to the Owner, and their campaigns stay (WS-04).
   */
  async remove(access: WorkspaceAccess, memberId: string, meta: RequestMeta): Promise<void> {
    await access.db.$transaction(async (tx) => {
      const member = await tx.workspaceMember.findUnique({
        where: { id: memberId },
        select: { id: true, userId: true, roleKey: true },
      });
      if (!member) throw memberNotFound();
      const leaving = member.userId === access.userId;
      if (!leaving && !access.can('members.manage')) {
        throw new DomainError('PERMISSION_DENIED', 'You do not have permission to remove members.');
      }
      if (member.roleKey === 'OWNER') {
        throw new DomainError(
          'PERMISSION_DENIED',
          leaving
            ? 'Transfer ownership to an Admin before leaving the workspace.'
            : 'The Owner cannot be removed. Ownership must be transferred first.',
        );
      }
      const owner = await tx.workspaceMember.findFirst({
        where: { roleKey: 'OWNER' },
        select: { userId: true },
      });
      const reassigned = await tx.inboxConnection.updateMany({
        where: { ownerUserId: member.userId, deletedAt: null },
        data: {
          ownerUserId: owner?.userId ?? null,
          status: 'PAUSED',
          statusReason: 'owner_removed',
        },
      });
      await tx.workspaceMember.delete({ where: { id: memberId } });
      await this.audit.record(
        {
          action: leaving ? 'member.left' : 'member.removed',
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          targetType: 'workspace_member',
          targetId: memberId,
          metadata: {
            userId: member.userId,
            roleKey: member.roleKey,
            mailboxesReassigned: reassigned.count,
          },
        },
        meta,
        tx,
      );
    });
    // Access is resolved from memberships on every request, so this takes effect immediately.
    // Sessions themselves stay valid (the user keeps their other workspaces).
    await this.prisma.session.updateMany({
      where: {
        activeWorkspaceId: access.workspaceId,
        user: { memberships: { none: { workspaceId: access.workspaceId } } },
      },
      data: { activeWorkspaceId: null },
    });
  }

  /** WS-05: to an existing Admin. The old Owner becomes an Admin, atomically. */
  async transferOwnership(
    access: WorkspaceAccess,
    memberId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await access.db.$transaction(async (tx) => {
      const [target, owner] = await Promise.all([
        tx.workspaceMember.findUnique({
          where: { id: memberId },
          select: { id: true, userId: true, roleKey: true },
        }),
        tx.workspaceMember.findFirst({
          where: { roleKey: 'OWNER' },
          select: { id: true, userId: true },
        }),
      ]);
      if (!target) throw memberNotFound();
      if (!owner || owner.userId !== access.userId) {
        throw new DomainError('PERMISSION_DENIED', 'Only the Owner can transfer ownership.');
      }
      if (target.roleKey !== 'ADMIN') {
        throw new DomainError(
          'UNPROCESSABLE',
          'Ownership can only be transferred to an Admin. Make them an Admin first.',
        );
      }
      // Demote first: the partial unique index allows exactly one OWNER at any moment.
      await tx.workspaceMember.update({ where: { id: owner.id }, data: { roleKey: 'ADMIN' } });
      await tx.workspaceMember.update({ where: { id: target.id }, data: { roleKey: 'OWNER' } });
      await this.audit.record(
        {
          action: 'workspace.ownership_transferred',
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          targetType: 'workspace_member',
          targetId: target.id,
          metadata: { fromUserId: owner.userId, toUserId: target.userId },
        },
        meta,
        tx,
      );
    });
  }
}
