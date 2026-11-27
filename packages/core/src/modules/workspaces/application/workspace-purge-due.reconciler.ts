import { Injectable } from '@nestjs/common';
import { JOB_NAMES, QUEUE_NAMES } from '@lga/contracts';
import { PrismaService } from '../../../database/prisma.service.js';
import type { ReconcileResult, Reconciler } from '../../../platform/jobs/reconciler.js';
import { createJobEnvelope, jobId } from '../../../queue/jobs.js';
import { QueueRegistry } from '../../../queue/queue.module.js';

const LIMIT = 100;

/** Stable per workspace: BullMQ ignores a second add while the first job still exists. */
export function workspacePurgeJobId(workspaceId: string): string {
  return jobId('workspace-purge', workspaceId);
}

/**
 * Enqueues `workspace.purge` for every workspace whose 30-day restore window has ended
 * (PRD WS-07), and re-enqueues purges that stopped half way (CLOSED but still present).
 */
@Injectable()
export class WorkspacePurgeDueReconciler implements Reconciler {
  readonly key = 'workspace-purge-due';
  readonly description = 'Enqueue the purge of workspaces whose restore window has ended';

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueRegistry,
  ) {}

  async run(): Promise<ReconcileResult> {
    const due = await this.prisma.workspace.findMany({
      where: {
        OR: [
          { status: 'PENDING_DELETION', purgeAfter: { lte: new Date() } },
          { status: 'CLOSED', deletedAt: { not: null } },
        ],
      },
      select: { id: true },
      orderBy: { purgeAfter: 'asc' },
      take: LIMIT,
    });
    const queue = this.queues.get(QUEUE_NAMES.maintenance);
    for (const { id } of due) {
      await queue.add(
        JOB_NAMES.workspacePurge,
        createJobEnvelope({
          workspaceId: id,
          requestId: 'reconciler',
          actorUserId: null,
          entity: { type: 'workspace', id },
        }),
        {
          jobId: workspacePurgeJobId(id),
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          // Removed when done, so a later sweep can re-enqueue if the row is somehow still there.
          removeOnComplete: true,
          removeOnFail: { age: 6 * 60 * 60 },
        },
      );
    }
    return { examined: due.length, acted: due.length };
  }
}
