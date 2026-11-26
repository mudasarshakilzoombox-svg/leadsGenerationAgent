import { EnvValidationError } from '@lga/shared';
import { describe, expect, it } from 'vitest';
import { loadApiEnv, loadWorkerEnv } from './env.js';

const base = {
  APP_ORIGIN: 'http://localhost:3300',
  DATABASE_URL: 'postgresql://lga_app:pw@localhost:5432/lga',
  VALKEY_URL: 'redis://:pw@localhost:6379/0',
};

describe('backend env', () => {
  it('applies defaults', () => {
    const env = loadApiEnv(base);
    expect(env).toMatchObject({
      APP_ENV: 'local',
      API_PORT: 4000,
      LOG_PRETTY: false,
      INTEGRATIONS_MODE: 'fake',
    });
    expect(loadWorkerEnv(base).HEARTBEAT_INTERVAL_MS).toBe(60_000);
  });

  it('rejects non-postgres database URLs', () => {
    expect(() => loadApiEnv({ ...base, DATABASE_URL: 'mysql://x@y/z' })).toThrow(
      EnvValidationError,
    );
  });

  it('enforces production safety rules', () => {
    try {
      loadApiEnv({ ...base, APP_ENV: 'production', LOG_PRETTY: 'true' });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('INTEGRATIONS_MODE');
      expect(message).toContain('APP_ORIGIN');
      expect(message).toContain('LOG_PRETTY');
    }
  });

  it('accepts a valid production config', () => {
    const env = loadApiEnv({
      ...base,
      APP_ENV: 'production',
      APP_ORIGIN: 'https://app.example.com',
      INTEGRATIONS_MODE: 'real',
    });
    expect(env.APP_ENV).toBe('production');
  });
});
