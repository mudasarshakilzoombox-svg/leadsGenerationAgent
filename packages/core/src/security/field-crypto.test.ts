import { describe, expect, it } from 'vitest';
import { type FieldAad, FieldCrypto, FieldCryptoError } from './field-crypto.js';

const key1 = Buffer.alloc(32, 1);
const key2 = Buffer.alloc(32, 2);
const aad: FieldAad = {
  workspaceId: '0193a1b2-0000-7000-8000-000000000001',
  rowId: '0193a1b2-0000-7000-8000-0000000000aa',
  field: 'credentials_encrypted',
};

const v1 = new FieldCrypto(new Map([[1, key1]]), 1);
const rotated = new FieldCrypto(
  new Map([
    [1, key1],
    [2, key2],
  ]),
  2,
);

describe('FieldCrypto', () => {
  it('round-trips with a random IV and the documented format', () => {
    const secret = '{"apiKey":"sk-live-123","note":"ünïcode ✓"}';
    const a = v1.encrypt(secret, aad);
    const b = v1.encrypt(secret, aad);
    expect(a).toMatch(/^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('sk-live');
    expect(v1.decrypt(a, aad)).toBe(secret);
    expect(v1.decrypt(v1.encrypt('', aad), aad)).toBe('');
  });

  it.each([
    ['another workspace', { ...aad, workspaceId: '0193a1b2-0000-7000-8000-000000000002' }],
    ['a user-level scope', { ...aad, workspaceId: null }],
    ['another row', { ...aad, rowId: '0193a1b2-0000-7000-8000-0000000000bb' }],
    ['another column', { ...aad, field: 'webhook_secret_encrypted' }],
  ])('refuses a ciphertext moved to %s', (_label, otherAad) => {
    const stored = v1.encrypt('secret', aad);
    expect(() => v1.decrypt(stored, otherAad)).toThrow(FieldCryptoError);
  });

  it('detects tampering with the IV, tag or ciphertext', () => {
    const stored = v1.encrypt('secret value', aad);
    const [version, iv, tag, ct] = stored.split(':') as [string, string, string, string];
    const flip = (part: string) => {
      const bytes = Buffer.from(part, 'base64url');
      bytes[0] = (bytes[0] ?? 0) ^ 0x01;
      return bytes.toString('base64url');
    };
    for (const forged of [
      [version, flip(iv), tag, ct],
      [version, iv, flip(tag), ct],
      [version, iv, tag, flip(ct)],
    ]) {
      expect(() => v1.decrypt(forged.join(':'), aad)).toThrow(FieldCryptoError);
    }
  });

  it.each([
    '',
    'plain text',
    'v1:abc:def:ghi',
    'v9:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AA',
    'v0:x:y:z',
  ])('rejects malformed or unknown-version input %j without detail', (stored) => {
    expect(() => v1.decrypt(stored, aad)).toThrow('Encrypted value could not be decrypted');
  });

  it('keeps decrypting old versions after rotation and re-encrypts to the active one', () => {
    const old = v1.encrypt('token', aad);
    expect(rotated.decrypt(old, aad)).toBe('token');
    expect(rotated.keyVersionOf(old)).toBe(1);
    expect(rotated.needsReencrypt(old)).toBe(true);
    const fresh = rotated.reencrypt(old, aad);
    expect(rotated.keyVersionOf(fresh)).toBe(2);
    expect(rotated.needsReencrypt(fresh)).toBe(false);
    expect(rotated.decrypt(fresh, aad)).toBe('token');
    // A node that only has key 1 cannot read version-2 values.
    expect(() => v1.decrypt(fresh, aad)).toThrow(FieldCryptoError);
  });

  it('round-trips through bytea bytes', () => {
    const bytes = v1.encryptToBytes('smtp-password', aad);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(v1.keyVersionOf(bytes)).toBe(1);
    expect(v1.decryptFromBytes(bytes, aad)).toBe('smtp-password');
  });

  it('enforces the plaintext size limit and AAD completeness', () => {
    expect(() => v1.encrypt('x'.repeat(64 * 1024 + 1), aad)).toThrow(FieldCryptoError);
    expect(() => v1.encrypt('x', { ...aad, field: '' })).toThrow(FieldCryptoError);
  });

  it('builds from env and validates the key ring', () => {
    const env = {
      APP_ENCRYPTION_KEYS: JSON.stringify({
        1: key1.toString('base64'),
        2: key2.toString('base64'),
      }),
      APP_ENCRYPTION_ACTIVE_VERSION: 2,
    };
    const crypto = FieldCrypto.fromEnv(env);
    expect(crypto.currentVersion).toBe(2);
    expect(crypto.decrypt(rotated.encrypt('x', aad), aad)).toBe('x');
    expect(() => FieldCrypto.fromEnv({ ...env, APP_ENCRYPTION_ACTIVE_VERSION: 3 })).toThrow(
      'active key 3',
    );
    expect(() => new FieldCrypto(new Map([[1, Buffer.alloc(16)]]), 1)).toThrow('32 bytes');
  });
});
