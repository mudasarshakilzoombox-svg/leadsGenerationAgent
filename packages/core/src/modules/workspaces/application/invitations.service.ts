import { Injectable } from '@nestjs/common';
import type {
  AssignableRole,
  CreateInvitationRequest,
  InvitationLookup,
  InvitationSummary,
  MembershipSummary,
} from '@lga/contracts';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainError } from '../../../errors/domain-error.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import type { WorkspaceAccess } from '../../../tenancy/workspace-access.service.js';
import { AuditService, type RequestMeta } from '../../audit/index.js';
import {
  type ActiveSession,
  AUTH_TOKEN_TTL,
  generateToken,
  hashToken,
  maskEmail,
  normalizeEmail,
  SessionService,
} from '../../identity/index.js';
import { NotificationDispatcher } from '../../notifications/index.js';
import { seatLockKey, SeatPolicy } from './seat-policy.js';
import { WorkspaceService } from './workspace.service.js';

const INVITE_LIMIT = { scope: 'ws:invite', limit: 30, windowSeconds: 60 * 60 } as const;
const PUBLIC_LIMIT = { scope: 'invite:ip', limit: 10, windowSeconds: 60 } as const;

const invitationSelect = {
  id: true,
  emailNormalized: true,
  roleKey: true,
  invitedByUserId: true,
  expiresAt: true,
  createdAt: true,
} as const;

type InvitationRow = {
  id: string;
  emailNormalized: string;
  roleKey: string;
  invitedByUserId: string | null;
  expiresAt: Date;
  createdAt: Date;
};

function toSummary(i: InvitationRow): InvitationSummary {
  return {
    id: i.id,
    email: i.emailNormalized,
    roleKey: i.roleKey as AssignableRole,
    status: i.expiresAt > new Date() ? 'PENDING' : 'EXPIRED',
    invitedByUserId: i.invitedByUserId,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}

const invalidInvitation = () =>
  new DomainError('NOT_FOUND', 'This invitation is invalid or has expired.');
const pending = { acceptedAt: null, revokedAt: null } as const;

/** Workspace invitations (PRD WS-03). Roles come from the invitation, never from the accepter. */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatPolicy,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly notify: NotificationDispatcher,
    private readonly sessions: SessionService,
    private readonly workspaces: WorkspaceService,
  ) {}

  async list(access: WorkspaceAccess): Promise<InvitationSummary[]> {
    const rows = await access.db.invitation.findMany({
      where: pending,
      select: invitationSelect,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSummary);
  }

  async create(
    access: WorkspaceAccess,
    input: CreateInvitationRequest,
    meta: RequestMeta,
  ): Promise<InvitationSummary> {
    await this.limiter.consume(
      INVITE_LIMIT,
      access.workspaceId,
      'Too many invitations sent recently. Try again later.',
    );
    const emailNormalized = normalizeEmail(input.email);
    const limit = await this.seats.limitFor(access.workspaceId);

    const invitation = await access.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${seatLockKey(access.workspaceId)}, 0))`;
      const alreadyMember = await tx.workspaceMember.count({
        where: { user: { emailNormalized, deletedAt: null } },
      });
      if (alreadyMember > 0)
        throw new DomainError('CONFLICT', 'This person is already a member of the workspace.');

      const existing = await tx.invitation.findFirst({
        where: { emailNormalized, ...pending },
        select: { id: true, expiresAt: true },
      });
      if (existing && existing.expiresAt > new Date()) {
        throw new DomainError(
          'CONFLICT',
          'An invitation is already pending for this email. Resend it instead.',
        );
      }
      // An expired invite keeps the pending-email unique slot: retire it before issuing a new one.
      if (existing)
        await tx.invitation.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

      const [members, invites] = await Promise.all([
        tx.workspaceMember.count(),
        tx.invitation.count({ where: { ...pending, expiresAt: { gt: new Date() } } }),
      ]);
      this.seats.assertWithin(members + invites, limit);

      const created = await tx.invitation.create({
        data: {
          workspaceId: access.workspaceId,
          emailNormalized,
          roleKey: input.roleKey,
          // Placeholder: the notifier mints and stores the real token when it sends the email.
          tokenHash: hashToken(generateToken()),
          invitedByUserId: access.userId,
          expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL.invitationSeconds * 1000),
        },
        select: invitationSelect,
      });
      await this.audit.record(
        {
          action: 'invitation.created',
          workspaceId: access.workspaceId,
          actorUserId: access.userId,
          targetType: 'invitation',
          targetId: created.id,
          metadata: { roleKey: input.roleKey },
        },
        meta,
        tx,
      );
      return created;
    });
    await this.notify.email(
      'workspace.invitation',
      { type: 'invitation', id: invitation.id },
      {
        requestId: meta.requestId,
        actorUserId: access.userId,
        workspaceId: access.workspaceId,
      },
    );
    return toSummary(invitation);
  }

  /** Extends the expiry and sends a fresh link (the old link stops working). */
  async resend(
    access: WorkspaceAccess,
    invitationId: string,
    meta: RequestMeta,
  ): Promise<InvitationSummary> {
    await this.limiter.consume(
      INVITE_LIMIT,
      access.workspaceId,
      'Too many invitations sent recently. Try again later.',
    );
    const existing = await access.db.invitation.findFirst({
      where: { id: invitationId, ...pending },
      select: { id: true },
    });
    if (!existing) throw new DomainError('NOT_FOUND', 'Invitation not found.');
    const updated = await access.db.invitation.update({
      where: { id: invitationId },
      data: { expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL.invitationSeconds * 1000) },
      select: invitationSelect,
    });
    await this.audit.record(
      {
        action: 'invitation.resent',
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        targetType: 'invitation',
        targetId: invitationId,
      },
      meta,
    );
    await this.notify.email(
      'workspace.invitation',
      { type: 'invitation', id: invitationId },
      {
        requestId: meta.requestId,
        actorUserId: access.userId,
        workspaceId: access.workspaceId,
      },
    );
    return toSummary(updated);
  }

  async revoke(access: WorkspaceAccess, invitationId: string, meta: RequestMeta): Promise<void> {
    const result = await access.db.invitation.updateMany({
      where: { id: invitationId, ...pending },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new DomainError('NOT_FOUND', 'Invitation not found.');
    await this.audit.record(
      {
        action: 'invitation.revoked',
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        targetType: 'invitation',
        targetId: invitationId,
      },
      meta,
    );
  }

  // Token-based (system context): the token itself is the capability, the workspace is derived.

  private async findValid(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        ...invitationSelect,
        workspaceId: true,
        acceptedAt: true,
        revokedAt: true,
        workspace: { select: { name: true, deletedAt: true, status: true } },
      },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.workspace.deletedAt ||
      invitation.workspace.status === 'CLOSED'
    ) {
      throw invalidInvitation();
    }
    return invitation;
  }

  async lookup(token: string, meta: RequestMeta): Promise<InvitationLookup> {
    await this.limiter.consume(PUBLIC_LIMIT, meta.ip ?? 'unknown');
    const invitation = await this.findValid(token);
    return {
      workspaceName: invitation.workspace.name,
      roleKey: invitation.roleKey as AssignableRole,
      emailHint: maskEmail(invitation.emailNormalized),
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async accept(
    session: ActiveSession,
    token: string,
    meta: RequestMeta,
  ): Promise<MembershipSummary> {
    await this.limiter.consume(PUBLIC_LIMIT, meta.ip ?? 'unknown');
    const invitation = await this.findValid(token);
    if (invitation.emailNormalized !== session.user.emailNormalized) {
      throw new DomainError(
        'PERMISSION_DENIED',
        'Sign in with the email address the invitation was sent to.',
      );
    }
    const workspaceId = invitation.workspaceId;
    const limit = await this.seats.limitFor(workspaceId);
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${seatLockKey(workspaceId)}, 0))`;
        const claimed = await tx.invitation.updateMany({
          where: { id: invitation.id, workspaceId, ...pending, expiresAt: { gt: now } },
          data: { acceptedAt: now, acceptedByUserId: session.userId },
        });
        if (claimed.count !== 1) throw invalidInvitation();
        const alreadyMember = await tx.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: session.userId } },
          select: { id: true },
        });
        if (!alreadyMember) {
          // Only members count here: this invitation's own pending seat is being converted.
          this.seats.assertWithin(
            await tx.workspaceMember.count({ where: { workspaceId } }),
            limit,
          );
          await tx.workspaceMember.create({
            data: {
              workspaceId,
              userId: session.userId,
              roleKey: invitation.roleKey,
              invitedByUserId: invitation.invitedByUserId,
            },
          });
        }
        // Receiving the link proves control of the address.
        // ownership-exempt: WS-03 accepting proves email control, same transaction
        await tx.user.updateMany({
          where: { id: session.userId, emailVerifiedAt: null },
          data: { emailVerifiedAt: now },
        });
        await this.audit.record(
          {
            action: 'invitation.accepted',
            workspaceId,
            actorUserId: session.userId,
            targetType: 'invitation',
            targetId: invitation.id,
            metadata: { roleKey: invitation.roleKey },
          },
          meta,
          tx,
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw invalidInvitation();
      throw error;
    }
    await this.sessions.invalidateUser(session.userId);
    const membership = (await this.workspaces.membershipsFor(session.userId)).find(
      (m) => m.workspace.id === workspaceId,
    );
    if (!membership) throw invalidInvitation();
    return membership;
  }
}
