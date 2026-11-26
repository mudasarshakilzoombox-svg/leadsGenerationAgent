import type { INestApplication } from '@nestjs/common';
import { HealthReportSchema } from '@lga/contracts';
import { loadApiEnv } from '@lga/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, httpClient } from '../test-app.js';

/** Real PostgreSQL + Valkey. Requires `pnpm infra:up && pnpm db:deploy` (or CI services). */
describe('api readiness against real infrastructure', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(loadApiEnv({ ...process.env, LOG_LEVEL: 'warn' }));
  });
  afterAll(async () => app.close());

  it('reports database, migrations and valkey as passing', async () => {
    const res = await httpClient(app).get('/health/ready');
    const report = HealthReportSchema.parse(res.body);
    expect(report.checks).toMatchObject({
      database: { status: 'pass' },
      migrations: { status: 'pass' },
      valkey: { status: 'pass' },
    });
    expect(res.status).toBe(200);
  });
});
