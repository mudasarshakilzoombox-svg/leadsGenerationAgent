import { describe, expect, it } from 'vitest';
import { countLocalMigrations, migrationProblem } from '../database/migrations.js';
import { jobId, createJobEnvelope, queuePrefix, valkeyKey } from '../queue/jobs.js';
import { buildHealthReport, migrationsCheck, runCheck } from './health.js';

describe('health checks', () => {
  it('reports pass and fail with latency', async () => {
    expect(await runCheck(() => Promise.resolve('3/3 applied'))).toMatchObject({
      status: 'pass',
      detail: '3/3 applied',
    });
    expect(await runCheck(() => Promise.reject(new Error('down')))).toMatchObject({
      status: 'fail',
      detail: 'down',
    });
  });

  it('fails checks that exceed the timeout', async () => {
    const result = await runCheck(() => new Promise(() => {}), 20);
    expect(result.status).toBe('fail');
  });

  it('hides failure details in production', async () => {
    const checks = {
      database: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
    };
    const local = await buildHealthReport('api', { APP_ENV: 'local', RELEASE: 'dev' }, checks);
    const prod = await buildHealthReport('api', { APP_ENV: 'production', RELEASE: 'abc' }, checks);
    expect(local.status).toBe('error');
    expect(local.checks.database?.detail).toContain('ECONNREFUSED');
    expect(prod.checks.database).not.toHaveProperty('detail');
  });

  it('evaluates migration state', async () => {
    expect(migrationProblem({ applied: 1, failed: 0 }, 1)).toBeNull();
    expect(migrationProblem({ applied: 0, failed: 0 }, 1)).toContain('pending');
    expect(migrationProblem({ applied: 1, failed: 1 }, 2)).toContain('failed');

    const prisma = { $queryRaw: () => Promise.resolve([{ applied: 1, failed: 0 }]) } as never;
    await expect(migrationsCheck(prisma, 1)()).resolves.toBe('1/1 applied');
  });

  it('counts the migrations shipped with this package', () => {
    expect(countLocalMigrations()).toBeGreaterThanOrEqual(1);
  });
});

describe('queue helpers', () => {
  it('namespaces keys per environment', () => {
    expect(queuePrefix({ APP_ENV: 'staging' })).toBe('lga:staging');
    expect(valkeyKey({ APP_ENV: 'local' }, 'worker', 'heartbeat')).toBe(
      'lga:local:worker:heartbeat',
    );
  });

  it('builds BullMQ-safe deterministic job ids', () => {
    expect(jobId('send', 'enr-1', 'step-2')).toBe('send_enr-1_step-2');
    expect(() => jobId('bad:id')).toThrow();
    expect(() => jobId(42)).toThrow();
  });

  it('creates valid envelopes', () => {
    const envelope = createJobEnvelope({
      workspaceId: null,
      requestId: 'req-12345678',
      actorUserId: null,
      entity: { type: 'system', id: 'heartbeat' },
    });
    expect(envelope.v).toBe(1);
    expect(envelope.args).toEqual({});
  });
});
