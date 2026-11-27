import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { ReconcileResult, Reconciler } from '../jobs/reconciler.js';

/** Request/response payloads are kept for debugging only this long (ADR-0037). */
export const AI_RUN_PAYLOAD_RETENTION_DAYS = 30;
const BATCH = 1_000;
const MAX_BATCHES = 20;

/**
 * Clears `ai_runs.request_payload` / `response_payload` older than 30 days (ADR-0037). The
 * metering columns (tokens, cost, latency, outcome) stay. Bounded per run; the next sweep
 * continues where this one stopped.
 */
@Injectable()
export class AiRunPayloadReconciler implements Reconciler {
  readonly key = 'ai-run-payload-purge';
  readonly description = 'Clear AI request and response payloads older than 30 days';

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<ReconcileResult> {
    const cutoff = new Date(Date.now() - AI_RUN_PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let acted = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const count = await this.prisma.$executeRaw`
        UPDATE ai_runs SET request_payload = NULL, response_payload = NULL
        WHERE id IN (
          SELECT id FROM ai_runs
          WHERE created_at < ${cutoff}
            AND (request_payload IS NOT NULL OR response_payload IS NOT NULL)
          LIMIT ${BATCH}
        )`;
      acted += count;
      if (count < BATCH) break;
    }
    return { examined: acted, acted };
  }
}
