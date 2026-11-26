import { fileURLToPath } from 'node:url';
import { REDACT_PATHS, REDACTED } from '@lga/shared';
import { pino, type LoggerOptions } from 'pino';
import type { BaseServerEnv } from '../config/env.js';

export type BackendService = 'api' | 'worker';

/**
 * Pino options shared by api and worker: JSON logs with stable fields and redaction
 * (docs/architecture/12-observability.md §2). Pretty output is for local development only.
 */
export function buildLoggerOptions(service: BackendService, env: BaseServerEnv): LoggerOptions {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service, env: env.APP_ENV, release: env.RELEASE },
    messageKey: 'msg',
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
  };

  if (env.LOG_PRETTY) {
    options.transport = {
      target: fileURLToPath(import.meta.resolve('pino-pretty')),
      options: {
        singleLine: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,env,release',
        messageKey: 'msg',
      },
    };
  } else {
    options.formatters = { level: (label) => ({ level: label }) };
  }
  return options;
}

/** Standalone logger for code that runs outside Nest (bootstrap, scripts). */
export function createLogger(service: BackendService, env: BaseServerEnv) {
  return pino(buildLoggerOptions(service, env));
}
