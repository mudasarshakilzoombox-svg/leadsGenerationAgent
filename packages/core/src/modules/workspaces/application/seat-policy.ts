import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { DomainError } from '../../../errors/domain-error.js';
import { isPlanKey, PLANS } from '../../../platform/billing/plans.js';

/**
 * Seat limit (PRD §8.3): plan seats + paid extra seats, or a Super Admin OVERRIDE entitlement.
 * Members and pending (unexpired) invitations both count. Callers count inside their own
 * tenant-scoped transaction after taking the per-workspace advisory lock (`SEAT_LOCK_SQL`).
 */
@Injectable()
export class SeatPolicy {
  constructor(private readonly prisma: PrismaService) {}

  /** The workspace's own plan row (read with the base client: `workspaces` is not tenant-scoped). */
  async limitFor(workspaceId: string): Promise<number> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        planKey: true,
        subscription: { select: { extraSeats: true } },
        entitlements: {
          where: {
            key: 'seats',
            source: 'OVERRIDE',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { value: true },
        },
      },
    });
    const override = workspace.entitlements[0];
    if (override) return override.value === null ? Number.MAX_SAFE_INTEGER : Number(override.value);
    const planSeats = isPlanKey(workspace.planKey) ? PLANS[workspace.planKey].limits.seats : 0;
    return planSeats + (workspace.subscription?.extraSeats ?? 0);
  }

  assertWithin(used: number, limit: number): void {
    if (used >= limit) {
      throw new DomainError(
        'QUOTA_EXCEEDED',
        'All seats on this plan are in use. Upgrade or add a seat to invite more people.',
        { extensions: { limit: { key: 'seats', used, limit } } },
      );
    }
  }
}

/** Advisory lock key for seat checks, so concurrent invites cannot both take the last seat. */
export function seatLockKey(workspaceId: string): string {
  return `seats:${workspaceId}`;
}
