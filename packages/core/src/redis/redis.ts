import { Logger } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';

/**
 * Connection roles (docs/architecture/06-background-jobs.md §1):
 * - `commands`: caches, locks, rate limits. Queues commands briefly while reconnecting.
 * - `queue-producer`: enqueueing. Fails fast when Valkey is down (reconcilers re-enqueue later).
 * - `queue-worker`: BullMQ workers. Requires `maxRetriesPerRequest: null`.
 */
export type RedisRole = 'commands' | 'queue-producer' | 'queue-worker';

/** Valkey client type for consumers (apps don't depend on ioredis directly). */
export type ValkeyClient = Redis;

const logger = new Logger('Valkey');

export function createRedis(url: string, role: RedisRole, extra: RedisOptions = {}): Redis {
  const client = new Redis(url, {
    connectionName: `lga-${role}`,
    maxRetriesPerRequest: role === 'queue-worker' ? null : 2,
    enableOfflineQueue: role !== 'queue-producer',
    connectTimeout: 5_000,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
    ...extra,
  });

  // Without a listener ioredis prints unhandled error events to stderr on every retry.
  let lastLogged = 0;
  client.on('error', (error: Error) => {
    const now = Date.now();
    if (now - lastLogged > 30_000) {
      lastLogged = now;
      logger.warn(`Valkey connection error (${role}): ${error.message}`);
    }
  });
  return client;
}

/** Close a client gracefully, falling back to a hard disconnect. */
export async function closeRedis(client: Redis): Promise<void> {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
