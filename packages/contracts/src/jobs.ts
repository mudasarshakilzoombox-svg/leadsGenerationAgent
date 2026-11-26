import { z } from 'zod';

/** BullMQ queue names (docs/architecture/06-background-jobs.md §2). */
export const QUEUE_NAMES = {
  system: 'system',
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job names use `domain.action`. */
export const JOB_NAMES = {
  systemHeartbeat: 'system.heartbeat',
} as const;
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/**
 * Every job payload uses this envelope. Payloads carry IDs only:
 * never emails, names, message bodies, tokens or provider responses (AGENTS.md rule 6).
 */
export const JobEnvelopeSchema = z
  .object({
    v: z.literal(1),
    /** null only for platform-level jobs that run in system context. */
    workspaceId: z.uuid().nullable(),
    requestId: z.string().min(1).max(128),
    actorUserId: z.uuid().nullable(),
    entity: z.object({ type: z.string().min(1).max(64), id: z.string().min(1).max(128) }),
    idempotencyKey: z.string().max(200).optional(),
    enqueuedAt: z.iso.datetime(),
    /** Small, non-sensitive parameters only. */
    args: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;
export type JobEnvelopeInput = z.input<typeof JobEnvelopeSchema>;
