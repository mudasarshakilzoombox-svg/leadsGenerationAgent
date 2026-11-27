import { describe, expect, it } from 'vitest';
import { SignedTokens, UnsubscribeTokens } from './signed-token.js';

const k1 = Buffer.alloc(32, 1);
const k2 = Buffer.alloc(32, 2);
let now = 1_764_000_000;
const clock = () => now;

const tokens = new SignedTokens(new Map([[1, k1]]), 1, clock);
const rotated = new SignedTokens(
  new Map([
    [1, k1],
    [2, k2],
  ]),
  2,
  clock,
);

const target = {
  workspaceId: '0193a1b2-0000-7000-8000-000000000001',
  contactId: '0193a1b2-0000-7000-8000-0000000000c1',
  campaignId: '0193a1b2-0000-7000-8000-0000000000d1',
};

describe('SignedTokens', () => {
  it('round-trips a payload in the k{id}.{payload}.{mac} format', () => {
    const token = tokens.issue('report-share', { id: 'r1' });
    expect(token).toMatch(/^k1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    expect(tokens.verify('report-share', token)).toEqual({ id: 'r1' });
  });

  it('binds the purpose: a token never verifies for another purpose', () => {
    const token = tokens.issue('report-share', { id: 'r1' });
    expect(tokens.verify('unsubscribe', token)).toBeNull();
  });

  it('rejects a tampered payload or MAC', () => {
    const token = tokens.issue('report-share', { id: 'r1' });
    const [kid, payload, mac] = token.split('.') as [string, string, string];
    const forgedPayload = Buffer.from(JSON.stringify({ id: 'r2' })).toString('base64url');
    expect(tokens.verify('report-share', `${kid}.${forgedPayload}.${mac}`)).toBeNull();
    const flipped = Buffer.from(mac, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(
      tokens.verify('report-share', `${kid}.${payload}.${flipped.toString('base64url')}`),
    ).toBeNull();
    // Same payload, MAC from another key.
    const other = new SignedTokens(new Map([[1, k2]]), 1, clock).issue('report-share', {
      id: 'r1',
    });
    expect(tokens.verify('report-share', other)).toBeNull();
  });

  it.each([
    '',
    'garbage',
    'k1.a.b',
    'k9.eyJpZCI6InIxIn0.AAAAAAAAAAAAAAAAAAAAAA',
    `k1.${'A'.repeat(600)}.AAAAAAAAAAAAAAAAAAAAAA`,
  ])('returns null for malformed, unknown-key or oversized input %#', (token) => {
    expect(tokens.verify('report-share', token)).toBeNull();
  });

  it('rotates: the new key signs, old key ids keep verifying', () => {
    const old = tokens.issue('report-share', { id: 'r1' });
    const fresh = rotated.issue('report-share', { id: 'r1' });
    expect(fresh.startsWith('k2.')).toBe(true);
    expect(rotated.verify('report-share', old)).toEqual({ id: 'r1' });
    expect(tokens.verify('report-share', fresh)).toBeNull();
  });

  it('enforces exp when present', () => {
    now = 1_764_000_000;
    const token = tokens.issue('report-share', { id: 'r1' }, { ttlSeconds: 60 });
    expect(tokens.verify('report-share', token)).toEqual({ id: 'r1', exp: now + 60 });
    now += 61;
    expect(tokens.verify('report-share', token)).toBeNull();
  });

  it('refuses invalid purposes and weak keys', () => {
    expect(() => tokens.issue('Bad Purpose', {})).toThrow('invalid purpose');
    expect(() => new SignedTokens(new Map([[1, Buffer.alloc(16)]]), 1)).toThrow('32 bytes');
    expect(() => new SignedTokens(new Map([[1, k1]]), 2)).toThrow('active key id');
  });
});

describe('UnsubscribeTokens', () => {
  const unsubscribe = new UnsubscribeTokens(tokens, clock);

  it('round-trips the ADR-0024 payload and never expires', () => {
    now = 1_764_000_000;
    const token = unsubscribe.issue(target);
    const payload: unknown = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
    );
    expect(payload).toEqual({
      v: 1,
      w: target.workspaceId,
      c: target.contactId,
      m: target.campaignId,
      t: now,
    });
    expect(token.length).toBeLessThan(300);
    now += 10 * 365 * 24 * 3600; // ten years later
    expect(unsubscribe.verify(token)).toEqual({
      ...target,
      issuedAt: new Date(1_764_000_000 * 1000),
    });
  });

  it('rejects tokens for other purposes and payloads that fail validation', () => {
    const share = tokens.issue('report-share', {
      v: 1,
      w: target.workspaceId,
      c: target.contactId,
      m: target.campaignId,
      t: 1,
    });
    expect(unsubscribe.verify(share)).toBeNull();
    const badShape = tokens.issue('unsubscribe', {
      v: 1,
      w: 'not-a-uuid',
      c: target.contactId,
      m: target.campaignId,
      t: 1,
    });
    expect(unsubscribe.verify(badShape)).toBeNull();
    const wrongVersion = tokens.issue('unsubscribe', {
      v: 2,
      w: target.workspaceId,
      c: target.contactId,
      m: target.campaignId,
      t: 1,
    });
    expect(unsubscribe.verify(wrongVersion)).toBeNull();
  });

  it('builds from env', () => {
    const fromEnv = UnsubscribeTokens.fromEnv({
      UNSUBSCRIBE_TOKEN_KEYS: JSON.stringify({ 1: k1.toString('base64') }),
      UNSUBSCRIBE_TOKEN_ACTIVE_KEY_ID: 1,
    });
    expect(fromEnv.verify(unsubscribe.issue(target))).toMatchObject(target);
  });
});
