import type { INestApplication } from '@nestjs/common';
import {
  HealthReportSchema,
  LivenessSchema,
  ProblemDetailsSchema,
  SystemInfoSchema,
} from '@lga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, httpClient, TEST_ORIGIN, testEnv } from './test-app.js';

/** Fakes let the HTTP pipeline run without PostgreSQL or Valkey. */
function fakes(state: { dbUp: boolean }) {
  return {
    prisma: {
      $queryRaw: (strings: TemplateStringsArray) => {
        if (!state.dbUp) return Promise.reject(new Error('db down'));
        const isMigrations = strings.join('').includes('_prisma_migrations');
        return Promise.resolve(isMigrations ? [{ applied: 99, failed: 0 }] : [{ ok: 1 }]);
      },
      $disconnect: () => Promise.resolve(),
    },
    redis: {
      ping: () => Promise.resolve('PONG'),
      quit: () => Promise.resolve('OK'),
      disconnect: () => undefined,
    },
  };
}

const problemCode = (body: unknown) => ProblemDetailsSchema.parse(body).code;

describe('api http pipeline', () => {
  const state = { dbUp: true };
  let app: INestApplication;
  let http: ReturnType<typeof httpClient>;

  beforeAll(async () => {
    app = await createTestApp(testEnv(), fakes(state));
    http = httpClient(app);
  });
  afterAll(async () => app.close());

  it('GET /health/live is unversioned and always ok', async () => {
    const res = await http.get('/health/live').expect(200);
    expect(LivenessSchema.parse(res.body)).toEqual({ status: 'ok', service: 'api' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /health/ready returns 200 when dependencies pass and 503 otherwise', async () => {
    const ok = await http.get('/health/ready').expect(200);
    expect(HealthReportSchema.parse(ok.body).status).toBe('ok');

    state.dbUp = false;
    const down = await http.get('/health/ready').expect(503);
    expect(HealthReportSchema.parse(down.body).checks.database?.status).toBe('fail');
    state.dbUp = true;
  });

  it('serves versioned routes under /api/v1', async () => {
    const res = await http.get('/api/v1/system/info').expect(200);
    expect(SystemInfoSchema.parse(res.body).apiVersion).toBe('v1');
  });

  it('returns RFC 9457 problem details for unknown routes, with a request id', async () => {
    const res = await http.get('/api/v1/does-not-exist?token=secret').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = ProblemDetailsSchema.parse(res.body);
    expect(problem.code).toBe('NOT_FOUND');
    expect(problem.instance).toBe('/api/v1/does-not-exist');
    expect(problem.requestId).toBe(res.headers['x-request-id']);
  });

  it('propagates a well-formed upstream request id', async () => {
    const res = await http
      .get('/api/v1/system/info')
      .set('x-request-id', 'nginx-req-0001')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('nginx-req-0001');
  });

  it('rejects state-changing requests without origin and CSRF header', async () => {
    const res = await http.post('/api/v1/system/info').send({}).expect(403);
    expect(problemCode(res.body)).toBe('ORIGIN_REJECTED');

    const wrongOrigin = await http
      .post('/api/v1/system/info')
      .set('origin', 'https://evil.example')
      .set('x-requested-with', 'lga-web')
      .expect(403);
    expect(problemCode(wrongOrigin.body)).toBe('ORIGIN_REJECTED');
  });

  it('lets same-origin requests with the CSRF header reach routing', async () => {
    const res = await http
      .post('/api/v1/system/info')
      .set('origin', TEST_ORIGIN)
      .set('x-requested-with', 'lga-web')
      .send({})
      .expect(404);
    expect(problemCode(res.body)).toBe('NOT_FOUND');
  });

  it('maps malformed JSON to 400 VALIDATION_FAILED', async () => {
    const res = await http
      .post('/api/v1/system/info')
      .set('origin', TEST_ORIGIN)
      .set('x-requested-with', 'lga-web')
      .set('content-type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(problemCode(res.body)).toBe('VALIDATION_FAILED');
  });

  it('does not advertise the framework', async () => {
    const res = await http.get('/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
