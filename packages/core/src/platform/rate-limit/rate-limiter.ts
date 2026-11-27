import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../../config/config.module.js';
import type { BaseServerEnv } from '../../config/env.js';
import { DomainError } from '../../errors/domain-error.js';
import { valkeyKey } from '../../queue/jobs.js';
import { REDIS } from '../../redis/redis.module.js';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitRule {
  /** Short, stable name, e.g. `auth:signup:ip`. */
  scope: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Fixed-window counters in Valkey (03-api.md §8). Identifiers must not be personal data:
 * use IP addresses, entity ids or keyed email hashes (`emailKey`).
 */
@Injectable()
export class RateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly env: BaseServerEnv,
  ) {}

  private key(scope: string, id: string): string {
    return valkeyKey(this.env, 'rl', scope, id);
  }

  /** Count one event and report whether it is within the limit. */
  async hit(rule: RateLimitRule, id: string): Promise<RateLimitResult> {
    const key = this.key(rule.scope, id);
    const result = await this.redis
      .multi()
      .incr(key)
      .pexpire(key, rule.windowSeconds * 1000, 'NX')
      .pttl(key)
      .exec();
    const count = Number(result?.[0]?.[1] ?? 0);
    const ttl = Number(result?.[2]?.[1] ?? rule.windowSeconds * 1000);
    return {
      allowed: count <= rule.limit,
      count,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1000)),
    };
  }

  /** Like `hit`, but throws `429 RATE_LIMITED` (with Retry-After) when over the limit. */
  async consume(
    rule: RateLimitRule,
    id: string,
    detail = 'Too many requests. Try again shortly.',
  ): Promise<void> {
    const result = await this.hit(rule, id);
    if (!result.allowed) {
      throw new DomainError('RATE_LIMITED', detail, {
        extensions: { retryAfterSeconds: result.retryAfterSeconds },
      });
    }
  }

  /** Current count without incrementing. */
  async count(scope: string, id: string): Promise<number> {
    return Number((await this.redis.get(this.key(scope, id))) ?? 0);
  }

  async reset(scope: string, id: string): Promise<void> {
    await this.redis.del(this.key(scope, id));
  }

  /** A blocking marker that expires by itself (progressive login delay). */
  async block(scope: string, id: string, seconds: number): Promise<void> {
    await this.redis.set(this.key(scope, id), '1', 'EX', Math.max(1, seconds));
  }

  /** Seconds until a `block` marker expires, or 0 when not blocked. */
  async blockedFor(scope: string, id: string): Promise<number> {
    const ttl = await this.redis.pttl(this.key(scope, id));
    return ttl > 0 ? Math.ceil(ttl / 1000) : 0;
  }
}
