import { Inject, Injectable } from '@nestjs/common';
import type { JobEnvelope } from '@lga/contracts';
import { APP_CONFIG, REDIS, valkeyKey, type ValkeyClient, type WorkerEnv } from '@lga/core';

/**
 * `system.heartbeat`: proves the full enqueue → Valkey → worker → process loop works.
 * Readiness fails when the last heartbeat is older than three intervals.
 */
@Injectable()
export class HeartbeatProcessor {
  private readonly key: string;

  constructor(
    @Inject(APP_CONFIG) private readonly env: WorkerEnv,
    @Inject(REDIS) private readonly redis: ValkeyClient,
  ) {
    this.key = valkeyKey(env, 'worker', 'heartbeat');
  }

  async handle(_envelope: JobEnvelope): Promise<void> {
    const ttlSeconds = Math.ceil((this.env.HEARTBEAT_INTERVAL_MS * 10) / 1000);
    await this.redis.set(this.key, new Date().toISOString(), 'EX', ttlSeconds);
  }

  async lastHeartbeat(): Promise<Date | null> {
    const value = await this.redis.get(this.key);
    return value ? new Date(value) : null;
  }

  maxAgeMs(): number {
    return this.env.HEARTBEAT_INTERVAL_MS * 3;
  }
}
