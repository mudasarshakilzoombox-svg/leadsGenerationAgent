import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EnvValidationError,
  envBoolean,
  envPort,
  isValidRequestId,
  parseEnv,
  stripQuery,
  TimeoutError,
  withTimeout,
} from './index.js';

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: envPort.default(4000),
  PRETTY: envBoolean.default(false),
});

describe('parseEnv', () => {
  it('parses, coerces and applies defaults', () => {
    const env = parseEnv(schema, { DATABASE_URL: 'postgresql://u@h/db', PRETTY: 'yes' }, 'test');
    expect(env).toEqual({ DATABASE_URL: 'postgresql://u@h/db', PORT: 4000, PRETTY: true });
  });

  it('treats empty strings as unset', () => {
    const env = parseEnv(schema, { DATABASE_URL: 'postgresql://u@h/db', PORT: '' }, 'test');
    expect(env.PORT).toBe(4000);
  });

  it('reports variable names but never values', () => {
    const secret = 'super-secret-value';
    try {
      parseEnv(schema, { DATABASE_URL: secret }, 'api');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).not.toContain(secret);
    }
  });
});

describe('utils', () => {
  it('strips query strings', () => {
    expect(stripQuery('/auth/verify?token=abc')).toBe('/auth/verify');
    expect(stripQuery('/health/live')).toBe('/health/live');
  });

  it('validates request ids', () => {
    expect(isValidRequestId('0193a8f2-aaaa-bbbb')).toBe(true);
    expect(isValidRequestId('short')).toBe(false);
    expect(isValidRequestId('bad id with spaces')).toBe(false);
  });

  it('times out slow promises', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'never')).rejects.toBeInstanceOf(
      TimeoutError,
    );
    await expect(withTimeout(Promise.resolve(1), 100, 'fast')).resolves.toBe(1);
  });
});

import { scrubBreadcrumb, scrubEvent, scrubText, scrubValue } from './scrub.js';

describe('error-report scrubbing (12-observability §4)', () => {
  it('replaces emails and long tokens inside free text', () => {
    // Built at runtime so no provider-shaped secret ever sits in the source (push protection).
    const fakeToken = `tok${'Ab1'.repeat(12)}`;
    expect(scrubText(`Login failed for jane.doe@example.com with key ${fakeToken}`)).toBe(
      'Login failed for [EMAIL] with key [TOKEN]',
    );
  });

  it('redacts deny-listed keys at any depth and never mutates the input', () => {
    const input = {
      user: { Email: 'a@b.co', nested: { password: 'x', note: 'mail c@d.io' } },
      ok: 1,
    };
    expect(scrubValue(input)).toEqual({
      user: { Email: '[REDACTED]', nested: { password: '[REDACTED]', note: 'mail [EMAIL]' } },
      ok: 1,
    });
    expect(input.user.Email).toBe('a@b.co');
  });

  it('drops request bodies, cookies, query strings, users and unknown headers but keeps ids', () => {
    const event = scrubEvent({
      event_id: '0123456789abcdef0123456789abcdef',
      release: 'abc123',
      user: { email: 'jane@example.com' },
      message: 'Boom for jane@example.com',
      request: {
        url: 'https://app.example/api/v1/x?token=secret',
        method: 'POST',
        data: { email: 'jane@example.com' },
        cookies: { session: 'v' },
        headers: { cookie: 'a=b', 'x-request-id': 'req-1', authorization: 'Bearer z' },
      },
    });
    expect(event).toEqual({
      event_id: '0123456789abcdef0123456789abcdef',
      release: 'abc123',
      message: 'Boom for [EMAIL]',
      request: {
        url: 'https://app.example/api/v1/x',
        method: 'POST',
        headers: { 'x-request-id': 'req-1' },
      },
    });
    expect(JSON.stringify(event)).not.toContain('example.com');
  });

  it('drops console breadcrumbs and scrubs the rest', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'http', message: 'GET for bob@site.org' })).toEqual({
      category: 'http',
      message: 'GET for [EMAIL]',
    });
  });
});
