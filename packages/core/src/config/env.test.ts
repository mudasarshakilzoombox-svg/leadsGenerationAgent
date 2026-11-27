import { EnvValidationError } from '@lga/shared';
import { describe, expect, it } from 'vitest';
import { loadApiEnv, loadWorkerEnv } from './env.js';

const base = {
  APP_ORIGIN: 'http://localhost:3300',
  DATABASE_URL: 'postgresql://lga_app:pw@localhost:5432/lga',
  VALKEY_URL: 'redis://:pw@localhost:6379/0',
};
const apiBase = {
  ...base,
  SESSION_PEPPER: 'unit-test-session-pepper-0123456789abc',
  EMAIL_HASH_PEPPER: 'unit-test-email-pepper-0123456789abcde',
};

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the env to be rejected');
}

describe('backend env', () => {
  it('applies defaults', () => {
    const env = loadApiEnv(apiBase);
    expect(env).toMatchObject({
      APP_ENV: 'local',
      API_PORT: 4000,
      LOG_PRETTY: false,
      INTEGRATIONS_MODE: 'fake',
    });
    const worker = loadWorkerEnv(base);
    expect(worker.HEARTBEAT_INTERVAL_MS).toBe(60_000);
    expect(worker.SMTP_URL).toBeUndefined();
  });

  it('rejects non-postgres database URLs', () => {
    expect(() => loadApiEnv({ ...apiBase, DATABASE_URL: 'mysql://x@y/z' })).toThrow(
      EnvValidationError,
    );
  });

  it('requires long session and email-hash peppers for the API, naming them without values', () => {
    const missing = messageOf(() => loadApiEnv(base));
    expect(missing).toContain('SESSION_PEPPER');
    expect(missing).toContain('EMAIL_HASH_PEPPER');
    const short = messageOf(() => loadApiEnv({ ...apiBase, SESSION_PEPPER: 'too-short' }));
    expect(short).toContain('SESSION_PEPPER');
    expect(short).not.toContain('too-short');
  });

  it('enforces production safety rules', () => {
    const message = messageOf(() =>
      loadApiEnv({ ...apiBase, APP_ENV: 'production', LOG_PRETTY: 'true' }),
    );
    expect(message).toContain('INTEGRATIONS_MODE');
    expect(message).toContain('APP_ORIGIN');
    expect(message).toContain('LOG_PRETTY');
  });

  it('requires a Turnstile secret with real integrations and an SMTP relay for the production worker', () => {
    expect(messageOf(() => loadApiEnv({ ...apiBase, INTEGRATIONS_MODE: 'real' }))).toContain(
      'TURNSTILE_SECRET_KEY',
    );
    const worker = messageOf(() =>
      loadWorkerEnv({
        ...base,
        APP_ENV: 'production',
        APP_ORIGIN: 'https://app.example.com',
        INTEGRATIONS_MODE: 'real',
      }),
    );
    expect(worker).toContain('SMTP_URL');
    expect(() => loadWorkerEnv({ ...base, SMTP_URL: 'http://not-smtp' })).toThrow(
      EnvValidationError,
    );
  });

  it('accepts a valid production config', () => {
    const env = loadApiEnv({
      ...apiBase,
      APP_ENV: 'production',
      APP_ORIGIN: 'https://app.example.com',
      INTEGRATIONS_MODE: 'real',
      TURNSTILE_SECRET_KEY: 'turnstile-secret',
    });
    expect(env.APP_ENV).toBe('production');
    const worker = loadWorkerEnv({
      ...base,
      APP_ENV: 'production',
      APP_ORIGIN: 'https://app.example.com',
      INTEGRATIONS_MODE: 'real',
      SMTP_URL: 'smtps://user:pass@email-smtp.eu-west-1.amazonaws.com:465',
    });
    expect(worker.SMTP_URL).toContain('smtps://');
  });
});
