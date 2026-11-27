import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { APP_CONFIG } from '../../config/config.module.js';
import type { BaseServerEnv } from '../../config/env.js';
import { valkeyKey } from '../../queue/jobs.js';
import { REDIS } from '../../redis/redis.module.js';

export interface ReconcileResult {
  /** Rows looked at. */
  examined: number;
  /** Rows changed or jobs enqueued. */
  acted: number;
}

/**
 * A reconciler repairs drift between PostgreSQL (the source of truth) and the queues
 * (ADR-0005, 06-background-jobs §9): it finds rows whose status says work should be happening
 * and makes sure it is. It must be idempotent and bounded: a run does a limited amount of work
 * and leaves the rest for the next sweep (every 5 minutes).
 */
export interface Reconciler {
  /** Stable kebab-case key, used in logs, metrics and the lock name. */
  readonly key: string;
  readonly description: string;
  run(): Promise<ReconcileResult>;
}

/** Multi-provider token: every reconciler is registered here. */
export const RECONCILERS = Symbol('RECONCILERS');

export interface SweepReport extends Partial<ReconcileResult> {
  key: string;
  outcome: 'ok' | 'skipped' | 'failed';
  durationMs: number;
}

/** A sweep never runs longer than the interval; the lock outlives a stuck run by a little. */
const LOCK_TTL_MS = 4.5 * 60 * 1000;

// Release the lock only if we still own it.
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/**
 * Runs every registered reconciler once (job `reconcile.sweep` on the `maintenance` queue).
 * Each reconciler has its own Valkey lock, so an overlapping sweep (two worker replicas, or a
 * manual retry from Bull Board) skips it instead of doing the work twice. One failing reconciler
 * never stops the others. System context: reason RECONCILER (09-multi-tenancy §6).
 */
@Injectable()
export class ReconcilerRunner {
  constructor(
    @Inject(RECONCILERS) private readonly reconcilers: Reconciler[],
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly env: BaseServerEnv,
    @InjectPinoLogger(ReconcilerRunner.name) private readonly logger: PinoLogger,
  ) {}

  keys(): string[] {
    return this.reconcilers.map((r) => r.key);
  }

  async sweep(only?: readonly string[]): Promise<SweepReport[]> {
    const reports: SweepReport[] = [];
    for (const reconciler of this.reconcilers) {
      if (only && !only.includes(reconciler.key)) continue;
      reports.push(await this.runOne(reconciler));
    }
    return reports;
  }

  private async runOne(reconciler: Reconciler): Promise<SweepReport> {
    const started = Date.now();
    const lockKey = valkeyKey(this.env, 'lock', 'reconcile', reconciler.key);
    const token = randomUUID();
    const log = { systemReason: 'RECONCILER', reconciler: reconciler.key };
    const acquired = await this.redis.set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX');
    if (acquired !== 'OK') {
      this.logger.info(log, 'Reconciler already running elsewhere; skipped');
      return { key: reconciler.key, outcome: 'skipped', durationMs: Date.now() - started };
    }
    try {
      const result = await reconciler.run();
      const durationMs = Date.now() - started;
      this.logger.info({ ...log, ...result, durationMs }, 'Reconciler finished');
      return { key: reconciler.key, outcome: 'ok', durationMs, ...result };
    } catch (error) {
      const durationMs = Date.now() - started;
      this.logger.error({ ...log, durationMs, err: error }, 'Reconciler failed');
      return { key: reconciler.key, outcome: 'failed', durationMs };
    } finally {
      await this.redis.eval(RELEASE, 1, lockKey, token).catch(() => undefined);
    }
  }
}
