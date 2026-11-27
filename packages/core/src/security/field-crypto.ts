import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { BaseServerEnv } from '../config/env.js';
import { parseActiveKeyring } from './keyring.js';

/**
 * Application-level field encryption (ADR-0021, SECURITY.md §5.3) for OAuth tokens, SMTP
 * passwords, BYOK keys, TOTP secrets and DSAR emails.
 *
 * AES-256-GCM, random 96-bit IV per value, stored as `v{keyVersion}:{iv}:{tag}:{ciphertext}`
 * (base64url parts). The AAD binds a ciphertext to its tenant, row **and column**, so it cannot
 * be copied to another workspace, row or field. Decrypted values never leave the backend and are
 * never logged; failures carry no detail.
 */

export interface FieldAad {
  /** Owning workspace, or null for user-level rows (e.g. TOTP factors). */
  workspaceId: string | null;
  /** Primary key of the row holding the value. */
  rowId: string;
  /** Column name, e.g. `credentials_encrypted`. */
  field: string;
}

export class FieldCryptoError extends Error {
  constructor(message = 'Encrypted value could not be decrypted') {
    super(message);
    this.name = 'FieldCryptoError';
  }
}

export const FIELD_CRYPTO_MAX_PLAINTEXT_BYTES = 64 * 1024;
const STORED = /^v([1-9][0-9]{0,5}):([A-Za-z0-9_-]{16}):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]*)$/;

function aadBytes(aad: FieldAad): Buffer {
  if (!aad.rowId || !aad.field) throw new FieldCryptoError('AAD requires rowId and field');
  return Buffer.from(`lga-fc-v1|w:${aad.workspaceId ?? '-'}|r:${aad.rowId}|f:${aad.field}`, 'utf8');
}

export class FieldCrypto {
  constructor(
    private readonly keys: ReadonlyMap<number, Buffer>,
    private readonly activeVersion: number,
  ) {
    const active = keys.get(activeVersion);
    if (!active) throw new Error('FieldCrypto: the active key version is not in the key ring');
    for (const key of keys.values()) {
      if (key.length !== 32) throw new Error('FieldCrypto: every key must be 32 bytes');
    }
  }

  static fromEnv(
    env: Pick<BaseServerEnv, 'APP_ENCRYPTION_KEYS' | 'APP_ENCRYPTION_ACTIVE_VERSION'>,
  ): FieldCrypto {
    const { keys, activeId } = parseActiveKeyring(
      env.APP_ENCRYPTION_KEYS,
      env.APP_ENCRYPTION_ACTIVE_VERSION,
      { exactBytes: 32 },
    );
    return new FieldCrypto(keys, activeId);
  }

  get currentVersion(): number {
    return this.activeVersion;
  }

  encrypt(plaintext: string, aad: FieldAad): string {
    const data = Buffer.from(plaintext, 'utf8');
    if (data.length > FIELD_CRYPTO_MAX_PLAINTEXT_BYTES) {
      throw new FieldCryptoError('Value too large to encrypt');
    }
    const key = this.keys.get(this.activeVersion) as Buffer;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aadBytes(aad));
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v${this.activeVersion}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  decrypt(stored: string, aad: FieldAad): string {
    const match = STORED.exec(stored);
    if (!match) throw new FieldCryptoError();
    const [, version, iv, tag, ciphertext] = match as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    const key = this.keys.get(Number(version));
    if (!key) throw new FieldCryptoError();
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), {
        authTagLength: 16,
      });
      decipher.setAAD(aadBytes(aad));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new FieldCryptoError();
    }
  }

  /** For `bytea` columns (`credentials_encrypted`, `webhook_secret_encrypted`, ...). */
  encryptToBytes(plaintext: string, aad: FieldAad): Uint8Array<ArrayBuffer> {
    return new Uint8Array(Buffer.from(this.encrypt(plaintext, aad), 'utf8'));
  }

  decryptFromBytes(stored: Uint8Array, aad: FieldAad): string {
    return this.decrypt(Buffer.from(stored).toString('utf8'), aad);
  }

  /** Key version of a stored value (for the `key_version` column and rotation queries). */
  keyVersionOf(stored: string | Uint8Array): number {
    const text = typeof stored === 'string' ? stored : Buffer.from(stored).toString('utf8');
    const match = STORED.exec(text);
    if (!match) throw new FieldCryptoError();
    return Number(match[1]);
  }

  needsReencrypt(stored: string | Uint8Array): boolean {
    return this.keyVersionOf(stored) !== this.activeVersion;
  }

  /** Re-encrypt under the active key (the `crypto.reencrypt` rotation job uses this). */
  reencrypt(stored: string, aad: FieldAad): string {
    return this.encrypt(this.decrypt(stored, aad), aad);
  }
}
