import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { ActorType, Prisma } from '../../generated/prisma/client.js';

/** Who did it and from where. Carried from the HTTP layer into services. */
export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
  requestId?: string | undefined;
}

export interface AuditEntry {
  action: string;
  workspaceId?: string | null;
  actorType?: ActorType;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string;
  /** Ids and enum values only: never emails, names, tokens or message content. */
  metadata?: Record<string, string | number | boolean | null>;
}

/** Structural, so the base client, a transaction and a tenant-scoped transaction all fit. */
interface AuditClient {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> };
}

/**
 * Append-only audit trail (SECURITY.md §12). The app DB role can only INSERT and SELECT here.
 * Pass the transaction client to record inside the same transaction as the change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: AuditEntry,
    meta: RequestMeta = {},
    client: AuditClient = this.prisma,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        workspaceId: entry.workspaceId ?? null,
        actorType: entry.actorType ?? (entry.actorUserId ? 'USER' : 'SYSTEM'),
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? {},
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        requestId: meta.requestId ?? null,
      },
    });
  }
}
