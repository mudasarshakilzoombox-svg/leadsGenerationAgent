import { Inject, Injectable } from '@nestjs/common';
import type { HealthReport } from '@lga/contracts';
import {
  APP_CONFIG,
  buildHealthReport,
  countLocalMigrations,
  databaseCheck,
  migrationsCheck,
  PrismaService,
  REDIS,
  valkeyCheck,
  type ValkeyClient,
  type WorkerEnv,
} from '@lga/core';
import { HeartbeatProcessor } from '../processors/heartbeat.processor.js';
import { WorkerRuntime } from '../runtime/worker-runtime.js';

@Injectable()
export class WorkerHealthService {
  private readonly expectedMigrations = countLocalMigrations();

  constructor(
    @Inject(APP_CONFIG) private readonly env: WorkerEnv,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: ValkeyClient,
    private readonly runtime: WorkerRuntime,
    private readonly heartbeat: HeartbeatProcessor,
  ) {}

  /** Readiness: dependencies up, workers running, and the heartbeat job processed recently. */
  ready(): Promise<HealthReport> {
    return buildHealthReport('worker', this.env, {
      database: databaseCheck(this.prisma),
      migrations: migrationsCheck(this.prisma, this.expectedMigrations),
      valkey: valkeyCheck(this.redis),
      workers: () => {
        if (!this.runtime.allRunning())
          return Promise.reject(new Error('one or more workers stopped'));
        return Promise.resolve();
      },
      heartbeat: async () => {
        const last = await this.heartbeat.lastHeartbeat();
        if (!last) throw new Error('no heartbeat processed yet');
        const ageMs = Date.now() - last.getTime();
        if (ageMs > this.heartbeat.maxAgeMs())
          throw new Error(`last heartbeat ${Math.round(ageMs / 1000)}s ago`);
        return `${Math.round(ageMs / 1000)}s ago`;
      },
    });
  }
}
