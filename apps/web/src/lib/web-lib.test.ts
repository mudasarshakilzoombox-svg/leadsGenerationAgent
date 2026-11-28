import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage } from './api/errors';
import { safeNext } from './auth/safe-next';
import { formatChange, formatPercent, humanize, initials } from './format';

describe('safeNext (no open redirects)', () => {
  it.each([
    ['/acme/contacts', '/acme/contacts'],
    ['/invitations/accept?token=abc_-123', '/invitations/accept?token=abc_-123'],
    ['//evil.example', undefined],
    ['/\\evil.example', undefined],
    ['https://evil.example', undefined],
    ['javascript:alert(1)', undefined],
    ['', undefined],
    [null, undefined],
  ])('%s -> %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe('ApiError', () => {
  it('parses problem details, field errors and Retry-After', async () => {
    const res = new Response(
      JSON.stringify({
        type: 'urn:lga:problem:rate_limited',
        title: 'Too many requests',
        status: 429,
        code: 'RATE_LIMITED',
        detail: 'Slow down.',
        requestId: 'req-1',
        errors: [{ pointer: '/email', code: 'x', message: 'Bad email' }],
      }),
      { status: 429, headers: { 'retry-after': '7', 'content-type': 'application/problem+json' } },
    );
    const error = await ApiError.fromResponse(res);
    expect(error).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Slow down.',
      retryAfterSeconds: 7,
      requestId: 'req-1',
    });
    expect(error.fieldErrors[0]!.pointer).toBe('/email');
    expect(errorMessage(error)).toBe('Too many attempts. Try again in 7 seconds.');
  });

  it('never shows raw server failures, only a reference', async () => {
    const error = new ApiError(500, 'INTERNAL', 'stack trace here', [], 'abcdef1234');
    expect(errorMessage(error)).toBe(
      'Something went wrong on our side. Try again. Reference: abcdef12',
    );
    const junk = await ApiError.fromResponse(new Response('<html>', { status: 502 }));
    expect(junk.code).toBeUndefined();
    expect(errorMessage(new TypeError('fetch failed'))).toMatch(/offline/);
  });
});

describe('format', () => {
  it('formats rates, changes and labels', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1 / 3)).toBe('33.3%');
    expect(formatPercent(null)).toBe('—');
    expect(formatChange(0.25)).toBe('+25% vs previous');
    expect(formatChange(null)).toBe('No prior data');
    expect(humanize('MEETING_REQUEST')).toBe('Meeting request');
    expect(initials('Jane van Doe')).toBe('JV');
  });
});

import { sentryIngestOrigin, sentryOptions } from './observability/sentry-options';

describe('Sentry options (ADR-0040)', () => {
  it('adds only the DSN origin to the CSP, and nothing when unset or malformed', () => {
    expect(sentryIngestOrigin('https://key@o12.ingest.sentry.io/345')).toBe(
      'https://o12.ingest.sentry.io',
    );
    expect(sentryIngestOrigin(undefined)).toBe('');
    expect(sentryIngestOrigin('not a url')).toBe('');
  });

  it('scrubs events and never collects personal data', () => {
    const options = sentryOptions({
      dsn: 'https://k@o1.ingest.sentry.io/1',
      release: 'r',
      environment: 'test',
    });
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
    });
    expect(
      options.beforeSend({ message: 'failed for a.b@example.com', user: { email: 'x@y.z' } }),
    ).toEqual({
      message: 'failed for [EMAIL]',
    });
  });
});
