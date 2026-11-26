import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProblemDetailsSchema } from '@lga/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DomainError } from './domain-error.js';
import { toProblem } from './to-problem.js';

const ctx = { instance: '/api/v1/things', requestId: 'req-12345678' };

describe('toProblem', () => {
  it('renders domain errors with extensions', () => {
    const { problem, logLevel } = toProblem(
      new DomainError('QUOTA_EXCEEDED', 'Monthly email limit reached', {
        extensions: { limit: { key: 'emailsPerMonth', used: 3000, limit: 3000 } },
      }),
      ctx,
    );
    expect(ProblemDetailsSchema.parse(problem)).toBeTruthy();
    expect(problem).toMatchObject({
      status: 402,
      code: 'QUOTA_EXCEEDED',
      requestId: 'req-12345678',
    });
    expect(problem).toHaveProperty('limit.used', 3000);
    expect(logLevel).toBe('warn');
  });

  it('maps zod errors to field pointers', () => {
    const result = z.object({ steps: z.array(z.object({ delayDays: z.number() })) }).safeParse({
      steps: [{ delayDays: 'x' }],
    });
    const { problem } = toProblem(result.error, ctx);
    expect(problem.status).toBe(400);
    expect(problem.errors?.[0]?.pointer).toBe('/steps/0/delayDays');
  });

  it('maps Nest HTTP exceptions', () => {
    expect(toProblem(new NotFoundException('Cannot GET /x'), ctx).problem.code).toBe('NOT_FOUND');
    expect(toProblem(new BadRequestException('bad'), ctx).problem.code).toBe('VALIDATION_FAILED');
  });

  it('maps body-parser errors', () => {
    const tooLarge = Object.assign(new Error('too large'), {
      type: 'entity.too.large',
      status: 413,
    });
    const malformed = Object.assign(new Error('Unexpected token'), {
      type: 'entity.parse.failed',
      status: 400,
    });
    expect(toProblem(tooLarge, ctx).problem.code).toBe('PAYLOAD_TOO_LARGE');
    expect(toProblem(malformed, ctx).problem).toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 400,
    });
  });

  it('never leaks internal error messages', () => {
    const { problem, logLevel } = toProblem(new Error('connection to 10.0.0.5:5432 refused'), ctx);
    expect(problem).toMatchObject({ status: 500, code: 'INTERNAL' });
    expect(JSON.stringify(problem)).not.toContain('10.0.0.5');
    expect(logLevel).toBe('error');
  });
});
