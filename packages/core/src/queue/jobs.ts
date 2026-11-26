import { type JobEnvelope, type JobEnvelopeInput, JobEnvelopeSchema } from '@lga/contracts';
import type { BaseServerEnv } from '../config/env.js';

/** BullMQ key prefix. Each environment (and the staging stack) has its own namespace. */
export function queuePrefix(env: Pick<BaseServerEnv, 'APP_ENV'>): string {
  return `lga:${env.APP_ENV}`;
}

/** Namespaced Valkey key for non-queue data, e.g. `valkeyKey(env, 'worker', 'heartbeat')`. */
export function valkeyKey(env: Pick<BaseServerEnv, 'APP_ENV'>, ...parts: string[]): string {
  return [queuePrefix(env), ...parts].join(':');
}

/**
 * Deterministic BullMQ job id. BullMQ rejects custom ids containing `:` (and integer ids),
 * so parts are joined with `_`.
 */
export function jobId(...parts: Array<string | number>): string {
  const id = parts.map(String).join('_');
  if (id.includes(':')) throw new Error(`Job id must not contain ':' (got "${id}")`);
  if (/^\d+$/.test(id)) throw new Error('Job id must not be an integer');
  return id;
}

export type CreateEnvelopeInput = Omit<JobEnvelopeInput, 'v' | 'enqueuedAt'> & {
  enqueuedAt?: string;
};

/** Build and validate a job envelope (IDs only, no PII). */
export function createJobEnvelope(input: CreateEnvelopeInput): JobEnvelope {
  return JobEnvelopeSchema.parse({ v: 1, enqueuedAt: new Date().toISOString(), ...input });
}
