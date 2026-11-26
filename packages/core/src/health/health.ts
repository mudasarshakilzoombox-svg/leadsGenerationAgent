import type { HealthCheckResult, HealthReport, ServiceName } from '@lga/contracts';
import { withTimeout } from '@lga/shared';
import type { Redis } from 'ioredis';
import { type BaseServerEnv, exposeErrorDetails } from '../config/env.js';
import { type MigrationState, migrationProblem } from '../database/migrations.js';
import type { PrismaService } from '../database/prisma.service.js';

/** A check resolves (optionally with a short detail) on success and throws on failure. */
export type HealthCheck = () => Promise<string | void>;

const DEFAULT_TIMEOUT_MS = 2_000;

export async function runCheck(
  check: HealthCheck,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HealthCheckResult> {
  const started = performance.now();
  const elapsed = () => Math.round((performance.now() - started) * 10) / 10;
  try {
    const detail = await withTimeout(check(), timeoutMs, 'health check');
    return { status: 'pass', latencyMs: elapsed(), ...(detail ? { detail } : {}) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'check failed';
    return { status: 'fail', latencyMs: elapsed(), detail };
  }
}

export async function buildHealthReport(
  service: ServiceName,
  env: Pick<BaseServerEnv, 'APP_ENV' | 'RELEASE'>,
  checks: Record<string, HealthCheck>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HealthReport> {
  const entries = await Promise.all(
    Object.entries(checks).map(
      async ([name, check]) => [name, await runCheck(check, timeoutMs)] as const,
    ),
  );
  const expose = exposeErrorDetails(env);
  const results: Record<string, HealthCheckResult> = {};
  for (const [name, result] of entries) {
    // Failure reasons may name hosts or ports, so they are hidden in production.
    results[name] =
      result.status === 'fail' && !expose
        ? { status: 'fail', latencyMs: result.latencyMs }
        : result;
  }

  return {
    status: entries.every(([, r]) => r.status === 'pass') ? 'ok' : 'error',
    service,
    version: env.RELEASE,
    environment: env.APP_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: results,
  };
}

export function databaseCheck(prisma: Pick<PrismaService, '$queryRaw'>): HealthCheck {
  return async () => {
    await prisma.$queryRaw`SELECT 1`;
  };
}

export function migrationsCheck(
  prisma: Pick<PrismaService, '$queryRaw'>,
  expected: number,
): HealthCheck {
  return async () => {
    let rows: MigrationState[];
    try {
      rows = await prisma.$queryRaw<MigrationState[]>`
        SELECT
          count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied,
          count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS failed
        FROM _prisma_migrations`;
    } catch {
      throw new Error('migrations table missing (run db:deploy)');
    }
    const state = rows[0] ?? { applied: 0, failed: 0 };
    const problem = migrationProblem(state, expected);
    if (problem) throw new Error(problem);
    return `${state.applied}/${expected} applied`;
  };
}

export function valkeyCheck(redis: Pick<Redis, 'ping'>): HealthCheck {
  return async () => {
    const reply = await redis.ping();
    if (reply !== 'PONG') throw new Error('unexpected PING reply');
  };
}
