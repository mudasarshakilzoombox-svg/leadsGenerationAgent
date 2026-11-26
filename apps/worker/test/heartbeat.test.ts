import { loadWorkerEnv } from '@lga/core';
import { describe, expect, it } from 'vitest';
import { HeartbeatProcessor } from '../src/processors/heartbeat.processor.js';

function fakeRedis() {
  const store = new Map<string, { value: string; ttl: number }>();
  return {
    store,
    set: (key: string, value: string, _ex: 'EX', ttl: number) => {
      store.set(key, { value, ttl });
      return Promise.resolve('OK');
    },
    get: (key: string) => Promise.resolve(store.get(key)?.value ?? null),
  };
}

const env = loadWorkerEnv({
  APP_ENV: 'test',
  APP_ORIGIN: 'http://localhost:3300',
  DATABASE_URL: 'postgresql://t:t@127.0.0.1:1/t',
  VALKEY_URL: 'redis://127.0.0.1:1/0',
  HEARTBEAT_INTERVAL_MS: '5000',
});

const envelope = {
  v: 1 as const,
  workspaceId: null,
  requestId: 'scheduler',
  actorUserId: null,
  entity: { type: 'system', id: 'heartbeat' },
  enqueuedAt: new Date().toISOString(),
  args: {},
};

describe('HeartbeatProcessor', () => {
  it('records a namespaced heartbeat with a TTL', async () => {
    const redis = fakeRedis();
    const processor = new HeartbeatProcessor(env, redis as never);
    expect(await processor.lastHeartbeat()).toBeNull();

    await processor.handle(envelope);
    const entry = redis.store.get('lga:test:worker:heartbeat');
    expect(entry?.ttl).toBe(50);
    expect((await processor.lastHeartbeat())?.getTime()).toBeLessThanOrEqual(Date.now());
    expect(processor.maxAgeMs()).toBe(15_000);
  });
});
