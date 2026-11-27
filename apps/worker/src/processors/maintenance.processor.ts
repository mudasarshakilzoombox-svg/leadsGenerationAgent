import { Injectable } from '@nestjs/common';
import { JOB_NAMES, type JobEnvelope } from '@lga/contracts';
import { ReconcilerRunner, type SweepReport, WorkspacePurgeService } from '@lga/core';
import { UnrecoverableError } from 'bullmq';

/** Reconcilers run every 5 minutes (06-background-jobs §9, §10). */
export const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * `maintenance` queue (concurrency 1): `reconcile.sweep` runs every reconciler once;
 * `workspace.purge` deletes one workspace whose restore window has ended (PRD WS-07).
 * Both are idempotent, so retries from BullMQ or Bull Board are safe.
 */
@Injectable()
export class MaintenanceProcessor {
  constructor(
    private readonly reconcilers: ReconcilerRunner,
    private readonly purge: WorkspacePurgeService,
  ) {}

  async handle(name: string, envelope: JobEnvelope): Promise<unknown> {
    switch (name) {
      case JOB_NAMES.reconcileSweep: {
        const reports: SweepReport[] = await this.reconcilers.sweep();
        return { reports };
      }
      case JOB_NAMES.workspacePurge: {
        if (envelope.entity.type !== 'workspace') {
          throw new UnrecoverableError('workspace.purge needs a workspace entity');
        }
        const outcome = await this.purge.purge(envelope.entity.id);
        // Counts only: never row contents.
        return { status: outcome.status };
      }
      default:
        throw new UnrecoverableError(`Unknown job "${name}" on the maintenance queue`);
    }
  }
}
