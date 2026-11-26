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
  QueueRegistry,
  queuePrefix,
  type ValkeyClient,
  type WorkerEnv,
} from '@lga/core';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { HeartbeatProcessor } from '../processors/heartbeat.processor.js';

/** Base concurrency per queue (06-background-jobs §2), scaled by WORKER_CONCURRENCY_FACTOR. */
const BASE_CONCURRENCY: Record<QueueName, number> = { [QUEUE_NAMES.system]: 1 };

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
    @InjectPinoLogger(WorkerRuntime.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.connection = createRedis(this.env.VALKEY_URL, 'queue-worker');
    this.startWorker(QUEUE_NAMES.system, (job) => this.processSystem(job));
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
    // One immediate heartbeat so readiness turns green right after start.
    await queue.add(JOB_NAMES.systemHeartbeat, data, {
      jobId: jobId('heartbeat', 'boot', Date.now()),
      removeOnComplete: true,
    });
  }
}
