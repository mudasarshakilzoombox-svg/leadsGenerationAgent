import { describe, expect, it } from 'vitest';
import { isPlatformAdmin, normalizeIp } from '../src/admin/bull-board.js';

const admin = { user: { platformRole: 'SUPER_ADMIN' as const } };
const user = { user: { platformRole: 'NONE' as const } };
const env = (APP_ENV: 'local' | 'test' | 'staging' | 'production', list = ['127.0.0.1']) => ({
  APP_ENV,
  ADMIN_IP_ALLOWLIST: list,
});

describe('Bull Board placeholder guard (ADR-0038)', () => {
  it('needs a Super Admin on an allowlisted IP', () => {
    expect(isPlatformAdmin(admin as never, '127.0.0.1', env('local'))).toBe(true);
    expect(isPlatformAdmin(admin as never, '::ffff:127.0.0.1', env('local'))).toBe(true);
    expect(isPlatformAdmin(user as never, '127.0.0.1', env('local'))).toBe(false);
    expect(isPlatformAdmin(null, '127.0.0.1', env('local'))).toBe(false);
    expect(isPlatformAdmin(admin as never, '10.0.0.1', env('local'))).toBe(false);
    expect(isPlatformAdmin(admin as never, undefined, env('local'))).toBe(false);
  });

  it('denies by default: empty allowlist, and always in staging or production until MFA exists', () => {
    expect(isPlatformAdmin(admin as never, '127.0.0.1', env('local', []))).toBe(false);
    expect(isPlatformAdmin(admin as never, '127.0.0.1', env('staging'))).toBe(false);
    expect(isPlatformAdmin(admin as never, '127.0.0.1', env('production'))).toBe(false);
  });

  it('normalises IPv4-mapped IPv6 addresses', () => {
    expect(normalizeIp('::ffff:10.1.2.3')).toBe('10.1.2.3');
    expect(normalizeIp('::1')).toBe('::1');
    expect(normalizeIp(undefined)).toBe('');
  });
});
