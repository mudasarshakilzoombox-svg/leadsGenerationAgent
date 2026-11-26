import { parseEnv } from '@lga/shared';
import { describe, expect, it } from 'vitest';
import { webEnvSchema } from './env-schema';

describe('web env', () => {
  it('has safe local defaults', () => {
    expect(parseEnv(webEnvSchema, {}, 'web')).toEqual({
      INTERNAL_API_URL: 'http://localhost:4000',
      APP_ORIGIN: 'http://localhost:3300',
      APP_ENV: 'local',
      RELEASE: 'dev',
    });
  });

  it('rejects invalid URLs', () => {
    expect(() => parseEnv(webEnvSchema, { INTERNAL_API_URL: 'not a url' }, 'web')).toThrow(
      /INTERNAL_API_URL/,
    );
  });
});
