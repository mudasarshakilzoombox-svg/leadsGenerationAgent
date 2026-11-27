import { Injectable } from '@nestjs/common';
import { type EmailTemplate, JOB_NAMES, QUEUE_NAMES } from '@lga/contracts';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { createJobEnvelope } from '../../queue/jobs.js';
import { QueueRegistry } from '../../queue/queue.module.js';

export interface NotifyTarget {
  /** `verification_token`: email change, revert and identity-link rows (worker mints the token). */
  type: 'user' | 'invitation' | 'verification_token';
  id: string;
}

export interface NotifyContext {
  requestId?: string | undefined;
  actorUserId?: string | null | undefined;
  workspaceId?: string | null | undefined;
}

/**
 * Enqueues `notify.email` jobs. Call only after the transaction that created the target has
 * committed (ADR-0005). The payload holds ids only; the worker renders and sends.
 * Enqueue failures are logged, not thrown: every auth email has a user-triggered resend path.
 */
@Injectable()
export class NotificationDispatcher {
  constructor(
    private readonly queues: QueueRegistry,
    @InjectPinoLogger(NotificationDispatcher.name) private readonly logger: PinoLogger,
  ) {}

  async email(
    template: EmailTemplate,
    target: NotifyTarget,
    ctx: NotifyContext = {},
  ): Promise<void> {
    const envelope = createJobEnvelope({
      workspaceId: ctx.workspaceId ?? null,
      requestId: ctx.requestId ?? 'system',
      actorUserId: ctx.actorUserId ?? null,
      entity: target,
      args: { template },
    });
    try {
      await this.queues.get(QUEUE_NAMES.notifications).add(JOB_NAMES.notifyEmail, envelope, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
      });
    } catch (error) {
      this.logger.error(
        { err: error, template, entityType: target.type, entityId: target.id },
        'Could not enqueue email',
      );
    }
  }
}
