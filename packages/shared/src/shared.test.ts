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
