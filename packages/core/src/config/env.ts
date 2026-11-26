import { envBoolean, envPort, parseEnv } from '@lga/shared';
import { z } from 'zod';

export const APP_ENVS = ['local', 'test', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const postgresUrl = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'must be a postgresql:// connection URL',
});
const valkeyUrl = z.url({ protocol: /^rediss?$/, error: 'must be a redis:// or rediss:// URL' });

/** Variables shared by every backend process. */
const baseShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(APP_ENVS).default('local'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: envBoolean.default(false),
  RELEASE: z.string().min(1).max(64).default('dev'),
  APP_ORIGIN: z.url(),
  DATABASE_URL: postgresUrl,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  VALKEY_URL: valkeyUrl,
  INTEGRATIONS_MODE: z.enum(['real', 'fake']).default('fake'),
};

export const baseServerEnvSchema = z.object(baseShape);
export type BaseServerEnv = z.output<typeof baseServerEnvSchema>;

function refineServerEnv(
  env: Pick<BaseServerEnv, 'APP_ENV' | 'INTEGRATIONS_MODE' | 'APP_ORIGIN' | 'LOG_PRETTY'>,
  ctx: z.RefinementCtx,
): void {
  if (env.APP_ENV !== 'production') return;
  if (env.INTEGRATIONS_MODE === 'fake') {
    ctx.addIssue({
      code: 'custom',
      path: ['INTEGRATIONS_MODE'],
      message: 'fake integrations are not allowed when APP_ENV=production',
    });
  }
  if (!env.APP_ORIGIN.startsWith('https://')) {
    ctx.addIssue({
      code: 'custom',
      path: ['APP_ORIGIN'],
      message: 'must use https:// when APP_ENV=production',
    });
  }
  if (env.LOG_PRETTY) {
    ctx.addIssue({
      code: 'custom',
      path: ['LOG_PRETTY'],
      message: 'pretty logs are not allowed when APP_ENV=production (logs must be JSON)',
    });
  }
}

export const apiEnvSchema = z
  .object({
    ...baseShape,
    API_PORT: envPort.default(4000),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    /** Express `trust proxy` setting: only nginx on the private network is trusted. */
    TRUST_PROXY: z.string().min(1).default('loopback, linklocal, uniquelocal'),
  })
  .superRefine(refineServerEnv);
export type ApiEnv = z.output<typeof apiEnvSchema>;

export const workerEnvSchema = z
  .object({
    ...baseShape,
    WORKER_HEALTH_PORT: envPort.default(4100),
    WORKER_HEALTH_HOST: z.string().min(1).default('0.0.0.0'),
    /** Multiplier for every queue's concurrency (lowered while the staging stack runs). */
    WORKER_CONCURRENCY_FACTOR: z.coerce.number().min(0.1).max(4).default(1),
    HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).max(3_600_000).default(60_000),
  })
  .superRefine(refineServerEnv);
export type WorkerEnv = z.output<typeof workerEnvSchema>;

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source, 'api');
}

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return parseEnv(workerEnvSchema, source, 'worker');
}

/** Whether error details (e.g. failed health-check reasons) may be shown to clients. */
export function exposeErrorDetails(env: Pick<BaseServerEnv, 'APP_ENV'>): boolean {
  return env.APP_ENV !== 'production';
}
