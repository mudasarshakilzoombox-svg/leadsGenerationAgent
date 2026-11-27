import type { Redis } from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { BaseServerEnv } from '../../config/env.js';
import { type Reconciler, ReconcilerRunner } from './reconciler.js';

/** Minimal in-memory stand-in for the two Valkey commands the runner uses. */
function fakeRedis(held = new Set<string>()) {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      set: vi.fn((key: string, value: string) => {
        if (held.has(key) || store.has(key)) return Promise.resolve(null);
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      eval: vi.fn((_script: string, _n: number, key: string, token: string) => {
        if (store.get(key) === token) store.delete(key);
        return Promise.resolve(1);
      }),
    } as unknown as Redis,
  };
}

const logger = { info: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
const env = { APP_ENV: 'test' } as BaseServerEnv;

const reconciler = (key: string, run: Reconciler['run']): Reconciler => ({
  key,
  description: key,
  run,
});

describe('ReconcilerRunner (06-background-jobs §9)', () => {
  it('runs every reconciler, isolating failures, and releases its locks', async () => {
    const redis = fakeRedis();
    const second = vi.fn().mockResolvedValue({ examined: 3, acted: 2 });
    const runner = new ReconcilerRunner(
      [reconciler('broken', () => Promise.reject(new Error('boom'))), reconciler('ok', second)],
      redis.client,
      env,
      logger,
    );
    const reports = await runner.sweep();
    expect(reports.map((r) => [r.key, r.outcome])).toEqual([
      ['broken', 'failed'],
      ['ok', 'ok'],
    ]);
    expect(reports[1]).toMatchObject({ examined: 3, acted: 2 });
    expect(second).toHaveBeenCalledOnce();
    expect(redis.store.size).toBe(0);
  });

  it('skips a reconciler whose lock is held by another sweep', async () => {
    const run = vi.fn().mockResolvedValue({ examined: 0, acted: 0 });
    const redis = fakeRedis(new Set(['lga:test:lock:reconcile:busy']));
    const runner = new ReconcilerRunner([reconciler('busy', run)], redis.client, env, logger);
    expect((await runner.sweep())[0]).toMatchObject({ key: 'busy', outcome: 'skipped' });
    expect(run).not.toHaveBeenCalled();
  });

  it('can run a subset by key', async () => {
    const a = vi.fn().mockResolvedValue({ examined: 0, acted: 0 });
    const b = vi.fn().mockResolvedValue({ examined: 0, acted: 0 });
    const runner = new ReconcilerRunner(
      [reconciler('a', a), reconciler('b', b)],
      fakeRedis().client,
      env,
      logger,
    );
    await runner.sweep(['b']);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
    expect(runner.keys()).toEqual(['a', 'b']);
  });
});
