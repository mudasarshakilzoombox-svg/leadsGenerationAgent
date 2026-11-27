import { z } from 'zod';

/** BullMQ queue names (docs/architecture/06-background-jobs.md §2). */
export const QUEUE_NAMES = {
  system: 'system',
  notifications: 'notifications',
  ai: 'ai',
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job names use `domain.action`. */
export const JOB_NAMES = {
  systemHeartbeat: 'system.heartbeat',
  notifyEmail: 'notify.email',
  /** Runs `system.selftest` through AiActionPipeline: proves routing, provider and metering. */
  aiSelftest: 'ai.selftest',
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

/**
 * System (transactional) email templates. Recipients are always users or invitations,
 * never contacts (ADR-0008). Tokens are minted by the worker at send time (ADR-0034).
 */
export const EMAIL_TEMPLATES = [
  'auth.verify_email',
  'auth.signup_existing',
  'auth.password_reset',
  'auth.password_changed',
  'auth.new_device',
  'auth.account_locked',
  'workspace.invitation',
  // Sent for `verification_token` entities: the worker mints the token and sends to `new_email`.
  'auth.email_change_verify',
  'auth.email_changed',
  'auth.identity_link',
] as const;
export const EmailTemplateSchema = z.enum(EMAIL_TEMPLATES);
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

/** `args` of a `notify.email` job: identifiers only. */
export const NotifyEmailArgsSchema = z.strictObject({ template: EmailTemplateSchema });
