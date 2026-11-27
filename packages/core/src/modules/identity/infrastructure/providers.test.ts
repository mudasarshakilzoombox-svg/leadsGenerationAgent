// Adapter tests against recorded responses: no network.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { HibpBreachedPasswordChecker } from './breached-passwords.js';
import { TurnstileHumanVerifier } from './human-verifier.js';
import { PasswordHasher } from './password-hasher.js';

function response(body: string, status = 200): Response {
  return new Response(body, { status });
}

describe('HibpBreachedPasswordChecker', () => {
  const password = 'correct horse battery staple';
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();

  it('sends only the 5-char prefix and matches the suffix', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        response(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${sha1.slice(5)}:42\r\nFFFFF:0`),
      ),
    );
    const checker = new HibpBreachedPasswordChecker(fetchMock);
    expect(await checker.isBreached(password)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
    expect(url).not.toContain(sha1.slice(5));
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true');
  });

  it('ignores padding entries with a zero count and unrelated suffixes', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response(`${sha1.slice(5)}:0\r\nABCDEF:3`)));
    expect(
      await new HibpBreachedPasswordChecker(fetchMock as unknown as typeof fetch).isBreached(
        password,
      ),
    ).toBe(false);
  });

  it('fails open when the service is down', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response('', 503)));
    expect(
      await new HibpBreachedPasswordChecker(fetchMock as unknown as typeof fetch).isBreached(
        password,
      ),
    ).toBe(false);
  });
});

describe('TurnstileHumanVerifier', () => {
  it('accepts a successful siteverify response and posts the secret server-side', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response(JSON.stringify({ success: true }))));
    const verifier = new TurnstileHumanVerifier('secret-key', fetchMock);
    expect(await verifier.verify('token-1', '203.0.113.9')).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect(body.get('secret')).toBe('secret-key');
    expect(body.get('remoteip')).toBe('203.0.113.9');
  });

  it('fails closed on rejection or outage', async () => {
    const rejected = vi.fn(() =>
      Promise.resolve(
        response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] })),
      ),
    );
    expect(
      await new TurnstileHumanVerifier('s', rejected as unknown as typeof fetch).verify(
        't',
        undefined,
      ),
    ).toBe(false);
    const down = vi.fn(() => Promise.reject(new Error('timeout')));
    expect(
      await new TurnstileHumanVerifier('s', down as unknown as typeof fetch).verify('t', undefined),
    ).toBe(false);
  });
});

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes with argon2id at the baseline parameters and verifies NFKC-equivalent input', async () => {
    const stored = await hasher.hash('Ｐassword with fullwidth');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await hasher.verify(stored, 'Password with fullwidth')).toBe(true);
    expect(await hasher.verify(stored, 'wrong password!!')).toBe(false);
    expect(hasher.needsRehash(stored)).toBe(false);
  });

  it('never verifies when there is no stored hash, but still does the work', async () => {
    expect(await hasher.verify(null, 'dummy password for timing equalization')).toBe(false);
  });
});
