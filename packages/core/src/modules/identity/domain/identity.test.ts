import { passwordLength, PasswordSchema } from '@lga/contracts';
import { describe, expect, it } from 'vitest';
import {
  deviceKey,
  emailKey,
  generateToken,
  hashSessionToken,
  hashToken,
  ipPrefix,
  loginDelaySeconds,
  maskEmail,
  needsRehash,
  normalizeEmail,
  slugify,
} from './identity.js';

describe('identity domain', () => {
  it('normalizes emails for uniqueness', () => {
    expect(normalizeEmail('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com');
    expect(normalizeEmail('ｊａｎｅ@example.com')).toBe('jane@example.com');
  });

  it('measures passwords in NFKC code points (12..128)', () => {
    expect(passwordLength('🔐'.repeat(12))).toBe(12);
    expect(PasswordSchema.safeParse('short-pass').success).toBe(false);
    expect(PasswordSchema.safeParse('a'.repeat(12)).success).toBe(true);
    expect(PasswordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('generates 256-bit base64url tokens and hashes them deterministically', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(token);
    expect(Buffer.from(hashToken(token)).equals(Buffer.from(hashToken(token)))).toBe(true);
    expect(hashToken(token)).toHaveLength(32);
  });

  it('peppers session hashes', () => {
    const token = generateToken();
    const a = Buffer.from(hashSessionToken(token, 'p'.repeat(32)));
    const b = Buffer.from(hashSessionToken(token, 'q'.repeat(32)));
    expect(a.equals(b)).toBe(false);
    expect(a.equals(Buffer.from(hashToken(token)))).toBe(false);
  });

  it('keys rate limits by a keyed email hash', () => {
    const key = emailKey('jane@example.com', 'k'.repeat(32));
    expect(key).not.toContain('jane');
    expect(key).toBe(emailKey('jane@example.com', 'k'.repeat(32)));
  });

  it('asks for a rehash when parameters are weaker or the algorithm differs', () => {
    expect(needsRehash('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA')).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$aGFzaA')).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=4096,t=2,p=1$c2FsdA$aGFzaA')).toBe(true);
    expect(needsRehash('$argon2i$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA')).toBe(true);
    expect(needsRehash('$2b$12$abcdefghijklmnopqrstuv')).toBe(true);
  });

  it('delays progressively after five failures, capped at 30 s', () => {
    expect([0, 4, 5, 6, 7, 9, 10, 50].map(loginDelaySeconds)).toEqual([0, 0, 1, 2, 4, 16, 30, 30]);
  });

  it('derives a coarse device key', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
    expect(deviceKey(chrome, '203.0.113.9')).toBe('chrome:windows:203.0');
    expect(deviceKey(chrome, '::ffff:203.0.200.1')).toBe('chrome:windows:203.0');
    expect(ipPrefix('2001:db8:1:2::1')).toBe('2001:db8');
    expect(deviceKey(undefined, undefined)).toBe('other:other:unknown');
  });

  it('masks emails and slugifies names', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
    expect(slugify('  Acme Growth Agency! ')).toBe('acme-growth-agency');
    expect(slugify('Café Zoë')).toBe('cafe-zoe');
    expect(slugify('***')).toBe('workspace');
  });
});
