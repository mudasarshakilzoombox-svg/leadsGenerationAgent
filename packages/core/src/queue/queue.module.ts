import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { QueueName } from '@lga/contracts';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../config/config.module.js';
import type { BaseServerEnv } from '../config/env.js';
import { closeRedis, createRedis } from '../redis/redis.js';
import { queuePrefix } from './jobs.js';

/**
 * Producer-side queues, created lazily and shared per process. Jobs must be enqueued
 * after the DB transaction commits (ADR-0005). Reconcilers cover enqueue failures.
 */
@Injectable()
export class QueueRegistry implements OnApplicationShutdown {
  private readonly queues = new Map<QueueName, Queue>();
  private connection: Redis | undefined;

  constructor(@Inject(APP_CONFIG) private readonly env: BaseServerEnv) {}

  get(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      this.connection ??= createRedis(this.env.VALKEY_URL, 'queue-producer');
      queue = new Queue(name, { connection: this.connection, prefix: queuePrefix(this.env) });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([...this.queues.values()].map((queue) => queue.close()));
    if (this.connection) await closeRedis(this.connection);
  }
}

@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    return {
      module: QueueModule,
      global: true,
      providers: [QueueRegistry],
      exports: [QueueRegistry],
    };
  }
}
