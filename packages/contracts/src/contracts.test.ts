import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ERROR_STATUS,
  HealthReportSchema,
  JobEnvelopeSchema,
  ProblemDetailsSchema,
  problemType,
} from './index.js';

describe('error catalog', () => {
  it('has an HTTP status for every code', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('builds stable problem type URNs', () => {
    expect(problemType('NOT_FOUND')).toBe('urn:lga:problem:not_found');
  });

  it('accepts problem details with extension members', () => {
    const parsed = ProblemDetailsSchema.parse({
      type: problemType('QUOTA_EXCEEDED'),
      title: 'Quota exceeded',
      status: 402,
      code: 'QUOTA_EXCEEDED',
      limit: { key: 'emailsPerMonth', used: 3000, limit: 3000 },
    });
    expect(parsed).toHaveProperty('limit');
  });

  it('rejects unknown error codes', () => {
    expect(() =>
      ProblemDetailsSchema.parse({ type: 'x', title: 'x', status: 400, code: 'NOPE' }),
    ).toThrow();
  });
});

describe('job envelope', () => {
  const valid = {
    v: 1,
    workspaceId: null,
    requestId: 'req-123',
    actorUserId: null,
    entity: { type: 'system', id: 'heartbeat' },
    enqueuedAt: new Date().toISOString(),
  };

  it('parses a minimal envelope and defaults args', () => {
    expect(JobEnvelopeSchema.parse(valid).args).toEqual({});
  });

  it('rejects unknown top-level keys so PII cannot be smuggled in', () => {
    expect(() => JobEnvelopeSchema.parse({ ...valid, email: 'a@b.c' })).toThrow();
  });
});

describe('health report', () => {
  it('parses a valid report', () => {
    const report = HealthReportSchema.parse({
      status: 'ok',
      service: 'api',
      version: 'dev',
      environment: 'local',
      uptimeSeconds: 1,
      timestamp: new Date().toISOString(),
      checks: { database: { status: 'pass', latencyMs: 2 } },
    });
    expect(report.checks.database?.status).toBe('pass');
  });
});
