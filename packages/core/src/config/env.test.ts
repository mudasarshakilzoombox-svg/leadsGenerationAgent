import { EnvValidationError } from '@lga/shared';
import { describe, expect, it } from 'vitest';
import { loadApiEnv, loadWorkerEnv } from './env.js';

const base = {
  APP_ORIGIN: 'http://localhost:3300',
  DATABASE_URL: 'postgresql://lga_app:pw@localhost:5432/lga',
  VALKEY_URL: 'redis://:pw@localhost:6379/0',
  APP_ENCRYPTION_KEYS: '{"1":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
  UNSUBSCRIBE_TOKEN_KEYS: '{"1":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE="}',
  APP_ENCRYPTION_ACTIVE_VERSION: '1',
  UNSUBSCRIBE_TOKEN_ACTIVE_KEY_ID: '1',
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

  it('requires valid encryption and unsubscribe key rings for api and worker', () => {
    const { APP_ENCRYPTION_KEYS: _enc, UNSUBSCRIBE_TOKEN_KEYS: _unsub, ...withoutKeys } = base;
    const missing = messageOf(() => loadWorkerEnv(withoutKeys));
    expect(missing).toContain('APP_ENCRYPTION_KEYS');
    expect(missing).toContain('UNSUBSCRIBE_TOKEN_KEYS');

    const secretKey = Buffer.alloc(16, 7).toString('base64');
    const cases: Array<[Record<string, string>, string, string]> = [
      [{ APP_ENCRYPTION_KEYS: 'not json' }, 'APP_ENCRYPTION_KEYS', 'JSON object'],
      [{ APP_ENCRYPTION_KEYS: '[]' }, 'APP_ENCRYPTION_KEYS', 'JSON object'],
      [{ APP_ENCRYPTION_KEYS: '{}' }, 'APP_ENCRYPTION_KEYS', 'at least one key'],
      [{ APP_ENCRYPTION_KEYS: `{"1":"${secretKey}"}` }, 'APP_ENCRYPTION_KEYS', '32 bytes'],
      [{ APP_ENCRYPTION_KEYS: '{"x":"AAAA"}' }, 'APP_ENCRYPTION_KEYS', 'positive integer'],
      [{ APP_ENCRYPTION_ACTIVE_VERSION: '2' }, 'APP_ENCRYPTION_KEYS', 'active key 2'],
      [{ UNSUBSCRIBE_TOKEN_KEYS: `{"1":"${secretKey}"}` }, 'UNSUBSCRIBE_TOKEN_KEYS', '32 bytes'],
      [{ UNSUBSCRIBE_TOKEN_ACTIVE_KEY_ID: '9' }, 'UNSUBSCRIBE_TOKEN_KEYS', 'active key 9'],
    ];
    for (const [override, name, reason] of cases) {
      const message = messageOf(() => loadApiEnv({ ...apiBase, ...override }));
      expect(message).toContain(name);
      expect(message).toContain(reason);
      // Errors name the variable but never echo key material.
      expect(message).not.toContain(secretKey);
    }
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
