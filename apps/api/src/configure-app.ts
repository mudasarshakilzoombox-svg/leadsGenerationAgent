import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiEnv } from '@lga/core';
import { Logger } from 'nestjs-pino';
import { mountBullBoard } from './admin/bull-board.js';

export const API_PREFIX = 'api/v1';

/** HTTP-level setup shared by main.ts and tests, so tests exercise the real pipeline. */
export function configureApp(app: NestExpressApplication, env: ApiEnv): void {
  app.useLogger(app.get(Logger));
  app.flushLogs();

  // Only nginx on the private network may set X-Forwarded-* (client IP for rate limits and logs).
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.disable('etag');

  // Body limits (docs/architecture/03-api.md). CSV uploads will stream through a dedicated route.
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '64kb', extended: false });

  // Health endpoints stay unversioned for load balancers and uptime monitors.
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  // Queue dashboard (Super Admin + IP allowlist), registered before Nest's own routes.
  mountBullBoard(app, env);

  app.enableShutdownHooks();
}
