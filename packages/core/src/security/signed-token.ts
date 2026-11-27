import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { BaseServerEnv } from '../config/env.js';
import { parseActiveKeyring } from './keyring.js';

/**
 * Stateless HMAC tokens (ADR-0024): `k{keyId}.{base64url(JSON payload)}.{base64url(mac)}` where
 * `mac = HMAC-SHA256(key, purpose + "." + payloadPart)[0..16]`. The purpose is part of the MAC
 * input (domain separation), so a token minted for one purpose never verifies as another.
 * Payloads are not secret (IDs only) but unforgeable. Rotation: add a key id and make it
 * active; old ids keep verifying. `exp` (epoch seconds) is enforced when present.
 */

export const SIGNED_TOKEN_MAX_LENGTH = 512;
const PURPOSE = /^[a-z][a-z0-9._-]{1,40}$/;
const TOKEN = /^k([1-9][0-9]{0,5})\.([A-Za-z0-9_-]{2,})\.([A-Za-z0-9_-]{22})$/;

export type TokenPayload = Record<string, unknown>;

export class SignedTokens {
  constructor(
    private readonly keys: ReadonlyMap<number, Buffer>,
    private readonly activeKeyId: number,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    if (!keys.has(activeKeyId))
      throw new Error('SignedTokens: active key id is not in the key ring');
    for (const key of keys.values()) {
      if (key.length < 32) throw new Error('SignedTokens: keys must be at least 32 bytes');
    }
  }

  private mac(keyId: number, purpose: string, payloadPart: string): Buffer | undefined {
    const key = this.keys.get(keyId);
    if (!key) return undefined;
    return createHmac('sha256', key).update(`${purpose}.${payloadPart}`).digest().subarray(0, 16);
  }

  /** Sign `payload` for `purpose`. `ttlSeconds` adds an `exp` claim. */
  issue(purpose: string, payload: TokenPayload, options: { ttlSeconds?: number } = {}): string {
    if (!PURPOSE.test(purpose)) throw new Error('SignedTokens: invalid purpose');
    const body =
      options.ttlSeconds === undefined
        ? payload
        : { ...payload, exp: this.nowSeconds() + options.ttlSeconds };
    const payloadPart = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    const mac = this.mac(this.activeKeyId, purpose, payloadPart) as Buffer;
    const token = `k${this.activeKeyId}.${payloadPart}.${mac.toString('base64url')}`;
    if (token.length > SIGNED_TOKEN_MAX_LENGTH) throw new Error('SignedTokens: payload too large');
    return token;
  }

  /** The payload if the token is authentic, for this purpose, and not expired; else null. */
  verify(purpose: string, token: string): TokenPayload | null {
    if (typeof token !== 'string' || token.length > SIGNED_TOKEN_MAX_LENGTH) return null;
    const match = TOKEN.exec(token);
    if (!match) return null;
    const [, keyId, payloadPart, macPart] = match as unknown as [string, string, string, string];
    const expected = this.mac(Number(keyId), purpose, payloadPart);
    const actual = Buffer.from(macPart, 'base64url');
    if (!expected || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
    const exp = (payload as TokenPayload).exp;
    if (exp !== undefined && (typeof exp !== 'number' || exp <= this.nowSeconds())) return null;
    return payload as TokenPayload;
  }
}

const unsubscribePayload = z.object({
  v: z.literal(1),
  w: z.uuid(),
  c: z.uuid(),
  m: z.uuid(),
  t: z.number().int().nonnegative(),
});

export interface UnsubscribeTarget {
  workspaceId: string;
  contactId: string;
  campaignId: string;
}

/**
 * Unsubscribe links (SECURITY.md §7.5, 07-email §5). Tokens **never expire**: CAN-SPAM requires
 * at least 30 days and we keep every link working forever.
 */
export class UnsubscribeTokens {
  static readonly PURPOSE = 'unsubscribe';

  constructor(
    private readonly tokens: SignedTokens,
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  static fromEnv(
    env: Pick<BaseServerEnv, 'UNSUBSCRIBE_TOKEN_KEYS' | 'UNSUBSCRIBE_TOKEN_ACTIVE_KEY_ID'>,
  ): UnsubscribeTokens {
    const { keys, activeId } = parseActiveKeyring(
      env.UNSUBSCRIBE_TOKEN_KEYS,
      env.UNSUBSCRIBE_TOKEN_ACTIVE_KEY_ID,
      { minBytes: 32 },
    );
    return new UnsubscribeTokens(new SignedTokens(keys, activeId));
  }

  issue(target: UnsubscribeTarget): string {
    return this.tokens.issue(UnsubscribeTokens.PURPOSE, {
      v: 1,
      w: target.workspaceId,
      c: target.contactId,
      m: target.campaignId,
      t: this.nowSeconds(),
    });
  }

  verify(token: string): (UnsubscribeTarget & { issuedAt: Date }) | null {
    const payload = this.tokens.verify(UnsubscribeTokens.PURPOSE, token);
    const parsed = unsubscribePayload.safeParse(payload);
    if (!parsed.success) return null;
    const { w, c, m, t } = parsed.data;
    return { workspaceId: w, contactId: c, campaignId: m, issuedAt: new Date(t * 1000) };
  }
}
