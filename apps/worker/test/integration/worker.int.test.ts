import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadWorkerEnv } from '@lga/core';
import { sleep } from '@lga/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkerHealthService } from '../../src/health/worker-health.service.js';
import { WorkerModule } from '../../src/worker.module.js';

/**
 * Full loop against real Valkey + PostgreSQL: schedule → enqueue → BullMQ worker →
 * heartbeat processed → readiness green. Requires `pnpm infra:up && pnpm db:deploy`.
 */
describe('worker against real infrastructure', () => {
  let app: INestApplicationContext;

  beforeAll(async () => {
    // Separate APP_ENV namespace so a locally running dev worker doesn't interfere.
    const env = loadWorkerEnv({
      ...process.env,
      APP_ENV: 'test',
      LOG_LEVEL: 'warn',
      HEARTBEAT_INTERVAL_MS: '5000',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule.forRoot(env, { healthServer: false })],
    }).compile();
    app = moduleRef;
    await app.init();
  });
  afterAll(async () => app.close());

  it('processes the boot heartbeat and reports ready', async () => {
    const health = app.get(WorkerHealthService);
    let report = await health.ready();
    for (let i = 0; i < 40 && report.status !== 'ok'; i++) {
      await sleep(250);
      report = await health.ready();
    }
    expect(report.checks).toMatchObject({
      database: { status: 'pass' },
      migrations: { status: 'pass' },
      valkey: { status: 'pass' },
      workers: { status: 'pass' },
      heartbeat: { status: 'pass' },
    });
    expect(report.status).toBe('ok');
  });
});
