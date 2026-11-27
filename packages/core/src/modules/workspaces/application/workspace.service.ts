import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateWorkspaceRequest,
  MembershipSummary,
  RoleKeyValue,
  WorkspaceSummary,
} from '@lga/contracts';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PLANS } from '../../../platform/billing/plans.js';
import { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { resolvePermissions } from '../../../platform/tenancy/permissions.js';
import { parseWorkspaceSettings } from '../../../tenancy/workspace-settings.js';
import { AuditService, type RequestMeta } from '../../audit/audit.service.js';
import { slugify } from '../../identity/domain/identity.js';

const CREATE_LIMIT = { scope: 'ws:create:user', limit: 5, windowSeconds: 24 * 60 * 60 } as const;

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  planKey: string;
  trialEndsAt: Date | null;
  defaultTimezone: string;
  createdAt: Date;
};

export function toWorkspaceSummary(w: WorkspaceRow): WorkspaceSummary {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    status: w.status,
    planKey: w.planKey,
    trialEndsAt: w.trialEndsAt?.toISOString() ?? null,
    defaultTimezone: w.defaultTimezone,
    createdAt: w.createdAt.toISOString(),
  };
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
  ) {}

  /** WS-01: the creator becomes the Owner and a 14-day trial starts. */
  async create(
    user: { id: string; timezone: string | null },
    input: CreateWorkspaceRequest,
    meta: RequestMeta,
  ): Promise<WorkspaceSummary> {
    await this.limiter.consume(
      CREATE_LIMIT,
      user.id,
      'You have created several workspaces today. Try again tomorrow.',
    );
    const base = slugify(input.name);
    const trialDays = PLANS.trial.trialDays ?? 14;

    for (let attempt = 0; attempt < 6; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
      try {
        return await this.prisma.$transaction(async (tx) => {
          const workspace = await tx.workspace.create({
            data: {
              name: input.name,
              slug,
              planKey: 'trial',
              status: 'TRIALING',
              trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
              defaultTimezone: input.timezone ?? user.timezone ?? 'UTC',
              settings: {
                launchRequiresApproval: true,
                ...(input.websiteUrl ? { websiteUrl: input.websiteUrl } : {}),
              },
            },
          });
          await tx.workspaceMember.create({
            data: { workspaceId: workspace.id, userId: user.id, roleKey: 'OWNER' },
          });
          await this.audit.record(
            {
              action: 'workspace.created',
              workspaceId: workspace.id,
              actorUserId: user.id,
              targetType: 'workspace',
              targetId: workspace.id,
            },
            meta,
            tx,
          );
          return toWorkspaceSummary(workspace);
        });
      } catch (error) {
        const slugTaken =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          JSON.stringify(error.meta ?? {}).includes('slug');
        if (!slugTaken) throw error;
      }
    }
    throw new Error('Could not allocate a unique workspace slug');
  }

  /** Every workspace the user can open, with their role and effective permissions. */
  async membershipsFor(userId: string): Promise<MembershipSummary[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { userId, workspace: { deletedAt: null, status: { not: 'CLOSED' } } },
      select: {
        id: true,
        roleKey: true,
        workspace: {
          select: { id: true, name: true, slug: true, status: true, planKey: true, settings: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((m) => ({
      membershipId: m.id,
      workspace: {
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        status: m.workspace.status,
        planKey: m.workspace.planKey,
      },
      roleKey: m.roleKey as RoleKeyValue,
      permissions: [
        ...resolvePermissions(m.roleKey, parseWorkspaceSettings(m.workspace.settings)),
      ].sort(),
    }));
  }
}
