import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { JOB_NAMES, JobEnvelopeSchema, QUEUE_NAMES, type QueueName } from '@lga/contracts';
import {
  APP_CONFIG,
  closeRedis,
  createJobEnvelope,
  createRedis,
  jobId,
  NotificationDeliveryService,
  QueueRegistry,
  queuePrefix,
  reportError,
  type ValkeyClient,
  type WorkerEnv,
} from '@lga/core';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AiSelftestProcessor } from '../processors/ai-selftest.processor.js';
import { HeartbeatProcessor } from '../processors/heartbeat.processor.js';
import {
  MaintenanceProcessor,
  RECONCILE_INTERVAL_MS,
} from '../processors/maintenance.processor.js';

/** Base concurrency per queue (06-background-jobs §2), scaled by WORKER_CONCURRENCY_FACTOR. */
const BASE_CONCURRENCY: Record<QueueName, number> = {
  [QUEUE_NAMES.system]: 1,
  [QUEUE_NAMES.notifications]: 2,
  [QUEUE_NAMES.ai]: 2,
  [QUEUE_NAMES.maintenance]: 1,
};

/**
 * Owns the BullMQ workers and repeatable schedules of this process.
 * Job payloads are validated against the shared envelope before any handler runs.
 */
@Injectable()
export class WorkerRuntime implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly workers: Worker[] = [];
  private connection: ValkeyClient | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly env: WorkerEnv,
    private readonly queues: QueueRegistry,
    private readonly heartbeat: HeartbeatProcessor,
    private readonly notifications: NotificationDeliveryService,
    private readonly aiSelftest: AiSelftestProcessor,
    private readonly maintenance: MaintenanceProcessor,
    @InjectPinoLogger(WorkerRuntime.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.connection = createRedis(this.env.VALKEY_URL, 'queue-worker');
    this.startWorker(QUEUE_NAMES.system, (job) => this.processSystem(job));
    this.startWorker(QUEUE_NAMES.notifications, (job) => this.processNotifications(job));
    this.startWorker(QUEUE_NAMES.ai, (job) => this.processAi(job));
    this.startWorker(QUEUE_NAMES.maintenance, (job) =>
      this.maintenance.handle(job.name, JobEnvelopeSchema.parse(job.data)),
    );
    await this.registerSchedules();
  }

  /** True when every worker is running (used by readiness). */
  allRunning(): boolean {
    return this.workers.length > 0 && this.workers.every((worker) => worker.isRunning());
  }

  async onApplicationShutdown(): Promise<void> {
    this.logger.info('Stopping workers (finishing active jobs)');
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
    if (this.connection) await closeRedis(this.connection);
  }

  private startWorker(queue: QueueName, handler: (job: Job) => Promise<unknown>): void {
    const concurrency = Math.max(
      1,
      Math.round(BASE_CONCURRENCY[queue] * this.env.WORKER_CONCURRENCY_FACTOR),
    );
    const worker = new Worker(queue, handler, {
      connection: this.connection!,
      prefix: queuePrefix(this.env),
      concurrency,
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 14 * 86_400 },
    });
    worker.on('failed', (job, error) => {
      this.logger.error(
        { queue, jobId: job?.id, job: job?.name, attempt: job?.attemptsMade, err: error },
        'Job failed',
      );
      // Report only the final failure (retries exhausted), with ids for correlation.
      const finalAttempt = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
      if (finalAttempt) {
        reportError(error, {
          queue,
          jobName: job?.name,
          jobId: job?.id,
          workspaceId: (job?.data as { workspaceId?: string | null } | undefined)?.workspaceId,
        });
      }
    });
    worker.on('error', (error) => this.logger.error({ queue, err: error }, 'Worker error'));
    this.workers.push(worker);
    this.logger.info({ queue, concurrency }, 'Worker started');
  }

  private async processSystem(job: Job): Promise<void> {
    const envelope = JobEnvelopeSchema.parse(job.data);
    switch (job.name) {
      case JOB_NAMES.systemHeartbeat:
        await this.heartbeat.handle(envelope);
        return;
      default:
        throw new UnrecoverableError(`Unknown job "${job.name}" on queue ${QUEUE_NAMES.system}`);
    }
  }

  /** `notify.email`: system email. Errors are retried with backoff (attempts set by the producer). */
  private async processNotifications(job: Job): Promise<void> {
    const envelope = JobEnvelopeSchema.parse(job.data);
    switch (job.name) {
      case JOB_NAMES.notifyEmail:
        await this.notifications.deliver(envelope);
        return;
      default:
        throw new UnrecoverableError(
          `Unknown job "${job.name}" on queue ${QUEUE_NAMES.notifications}`,
        );
    }
  }

  /** AI jobs: every call goes through AiActionPipeline (AGENTS.md rules 7 and 10). */
  private async processAi(job: Job): Promise<void> {
    const envelope = JobEnvelopeSchema.parse(job.data);
    switch (job.name) {
      case JOB_NAMES.aiSelftest:
        await this.aiSelftest.handle(envelope);
        return;
      default:
        throw new UnrecoverableError(`Unknown job "${job.name}" on queue ${QUEUE_NAMES.ai}`);
    }
  }

  private async registerSchedules(): Promise<void> {
    const queue = this.queues.get(QUEUE_NAMES.system);
    const data = createJobEnvelope({
      workspaceId: null,
      requestId: 'scheduler',
      actorUserId: null,
      entity: { type: 'system', id: 'heartbeat' },
    });
    // Idempotent: schedulers are owned by code and re-upserted at every start.
    await queue.upsertJobScheduler(
      'system-heartbeat',
      { every: this.env.HEARTBEAT_INTERVAL_MS },
      { name: JOB_NAMES.systemHeartbeat, data, opts: { removeOnComplete: { count: 100 } } },
    );
    // Reconcilers: every 5 minutes, system context (06-background-jobs §9).
    await this.queues.get(QUEUE_NAMES.maintenance).upsertJobScheduler(
      'maintenance-reconcile',
      { every: RECONCILE_INTERVAL_MS },
      {
        name: JOB_NAMES.reconcileSweep,
        data: createJobEnvelope({
          workspaceId: null,
          requestId: 'scheduler',
          actorUserId: null,
          entity: { type: 'system', id: 'reconcile' },
        }),
        opts: { removeOnComplete: { count: 200 }, removeOnFail: { age: 14 * 86_400 } },
      },
    );
    // One immediate heartbeat so readiness turns green right after start.
    await queue.add(JOB_NAMES.systemHeartbeat, data, {
      jobId: jobId('heartbeat', 'boot', Date.now()),
      removeOnComplete: true,
    });
  }
}
