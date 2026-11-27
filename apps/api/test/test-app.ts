import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { type ApiEnv, loadApiEnv, PrismaService, REDIS } from '@lga/core';
import request from 'supertest';

type SupertestTarget = Parameters<typeof request>[0];
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

export const TEST_ORIGIN = 'http://localhost:3300';

export function testEnv(overrides: Record<string, string> = {}): ApiEnv {
  return loadApiEnv({
    APP_ENV: 'test',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    APP_ORIGIN: TEST_ORIGIN,
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
    VALKEY_URL: 'redis://127.0.0.1:1/0',
    SESSION_PEPPER: 'test-only-session-pepper-0123456789abcdef',
    EMAIL_HASH_PEPPER: 'test-only-email-pepper-0123456789abcdefgh',
    ...overrides,
  });
}

export interface Fakes {
  prisma?: unknown;
  redis?: unknown;
  /** Extra provider overrides, e.g. `[[SYSTEM_MAILER, captureMailer]]`. */
  providers?: Array<[token: unknown, value: unknown]>;
}

/** Build the real HTTP pipeline. Pass fakes to run without PostgreSQL/Valkey. */
export async function createTestApp(env: ApiEnv, fakes?: Fakes): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] });
  if (fakes?.prisma) builder = builder.overrideProvider(PrismaService).useValue(fakes.prisma);
  if (fakes?.redis) builder = builder.overrideProvider(REDIS).useValue(fakes.redis);
  for (const [token, value] of fakes?.providers ?? []) {
    builder = builder.overrideProvider(token as symbol).useValue(value);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
    bodyParser: false,
  });
  configureApp(app, env);
  await app.init();
  return app;
}

/** Typed supertest agent for a Nest app. */
export function httpClient(app: INestApplication) {
  return request(app.getHttpServer() as SupertestTarget);
}
