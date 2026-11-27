/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- supertest bodies are untyped JSON; each assertion checks their shape. */
// Google / Microsoft sign-in (PRD AUTH-03, 08-authentication §4.3) through the fake identity
// provider: PKCE + state + nonce, linking rules, open-redirect safety, identity management.
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, Harness, STRONG_PASSWORD } from './harness.js';

let h: Harness;
beforeAll(async () => {
  h = await Harness.create();
});
afterAll(async () => h?.close());

const STATE_COOKIE = '__Host-lga_oauth';
const LINK_COOKIE = '__Host-lga_oauth_link';

function setCookie(res: Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  const header = list.find((c) => c.startsWith(`${name}=`));
  return header ? header.slice(name.length + 1).split(';')[0] : undefined;
}

function withCookies(
  client: Client,
  extra: Record<string, string | undefined>,
): Record<string, string> {
  const parts = [client.cookie ? `__Host-lga_session=${client.cookie}` : null];
  for (const [k, v] of Object.entries(extra)) if (v) parts.push(`${k}=${v}`);
  return { Cookie: parts.filter(Boolean).join('; ') };
}

const apiPath = (location: string) => {
  const url = new URL(location);
  return `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`;
};

interface FlowResult {
  callback: Response;
  location: string;
  linkCookie?: string;
  authorizeUrl: URL;
}

/** start → fake IdP page → authorize → callback, like a browser. */
async function oauth(
  client: Client,
  provider: 'google' | 'microsoft',
  email: string,
  opts: {
    verified?: boolean;
    intent?: 'login' | 'link';
    next?: string;
    tamperState?: boolean;
  } = {},
): Promise<FlowResult> {
  const qs = new URLSearchParams({
    intent: opts.intent ?? 'login',
    ...(opts.next ? { next: opts.next } : {}),
  });
  const start = await client.get(`/auth/oauth/${provider}/start?${qs.toString()}`);
  expect(start.status).toBe(302);
  const stateCookie = setCookie(start, STATE_COOKIE);
  expect(stateCookie).toBeDefined();
  const authorizeUrl = new URL(start.headers.location as string);
  const state = authorizeUrl.searchParams.get('state')!;
  const nonce = authorizeUrl.searchParams.get('nonce')!;
  const authorize = await client.get(
    `/auth/oauth/fake/${provider}/authorize?${new URLSearchParams({
      state,
      nonce,
      email,
      name: 'OAuth Person',
      ...(opts.verified === false ? {} : { verified: '1' }),
    }).toString()}`,
  );
  expect(authorize.status).toBe(302);
  let callbackPath = apiPath(authorize.headers.location as string);
  if (opts.tamperState) callbackPath = callbackPath.replace(/state=[^&]+/, 'state=forged');
  const callback = await client.get(
    callbackPath,
    withCookies(client, { [STATE_COOKIE]: stateCookie }),
  );
  expect(callback.status).toBe(302);
  return {
    callback,
    location: callback.headers.location as string,
    linkCookie: setCookie(callback, LINK_COOKIE),
    authorizeUrl,
  };
}

describe('OAuth sign-in (AUTH-03)', () => {
  it('lists both providers in fake mode and asks only for sign-in scopes (AC3)', async () => {
    const res = await h.client().get('/auth/providers');
    expect(res.body).toEqual({ providers: ['google', 'microsoft'] });
    const start = await h.client().get('/auth/oauth/google/start');
    const url = new URL(start.headers.location as string);
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(start.headers.location).not.toMatch(/gmail|mail\.|Mail\.|calendar/i);
    const cookie = (start.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith(STATE_COOKIE),
    )!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('creates a verified account on first sign-in, then signs the same identity back in (AC1)', async () => {
    const email = h.email('oauth-new');
    const first = await oauth(h.client(), 'google', email);
    expect(first.location).toMatch(/\/workspaces$/);
    const user = await h.prisma.user.findFirst({
      where: { emailNormalized: email },
      select: {
        id: true,
        emailVerifiedAt: true,
        passwordHash: true,
        termsVersionAccepted: true,
        authIdentities: true,
      },
    });
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(user?.passwordHash).toBeNull();
    expect(user?.termsVersionAccepted).not.toBeNull();
    expect(user?.authIdentities).toHaveLength(1);

    const again = h.client();
    const second = await oauth(again, 'google', email, { next: '/acme/campaigns' });
    expect(second.location).toMatch(/\/acme\/campaigns$/);
    const me = await again.get('/auth/me');
    expect(me.body).toMatchObject({ user: { email, emailVerified: true, hasPassword: false } });
  });

  it('links an existing password account only after the right password (AC2)', async () => {
    const existing = await h.verifiedUser('oauth-pw');
    const browser = h.client();
    const flow = await oauth(browser, 'microsoft', existing.email);
    expect(flow.location).toMatch(/\/login\/link\?provider=microsoft$/);
    expect(flow.linkCookie).toBeDefined();
    expect(browser.cookie).toBeUndefined(); // not signed in yet

    const pending = await browser.get(
      '/auth/oauth/link',
      withCookies(browser, { [LINK_COOKIE]: flow.linkCookie }),
    );
    expect(pending.body).toMatchObject({ provider: 'microsoft' });
    expect(pending.body.maskedEmail).not.toBe(existing.email);

    const wrong = await browser.post(
      '/auth/oauth/link',
      { password: 'wrong password 123' },
      withCookies(browser, { [LINK_COOKIE]: flow.linkCookie }),
    );
    expect(wrong.status).toBe(400);
    expect(await h.prisma.authIdentity.count({ where: { userId: existing.id } })).toBe(0);

    const right = await browser.post(
      '/auth/oauth/link',
      { password: STRONG_PASSWORD },
      withCookies(browser, { [LINK_COOKIE]: flow.linkCookie }),
    );
    expect(right.status).toBe(200);
    expect(browser.cookie).toBeDefined();
    expect(await h.prisma.authIdentity.count({ where: { userId: existing.id } })).toBe(1);
    // From now on, Microsoft signs in directly.
    expect((await oauth(h.client(), 'microsoft', existing.email)).location).toMatch(/\/$/);
  });

  it('emails a confirmation link for an existing account without a password', async () => {
    const email = h.email('oauth-only');
    await oauth(h.client(), 'google', email); // OAuth-only account
    const flow = await oauth(h.client(), 'microsoft', email);
    expect(flow.location).toMatch(/\/login\/link\?provider=microsoft&sent=1$/);
    const token = await h.tokenFrom(email, 'auth.identity_link');
    const browser = h.client();
    const confirmed = await browser.post('/auth/oauth/link/confirm', { token });
    expect(confirmed.status).toBe(200);
    expect(browser.cookie).toBeDefined();
    const user = await h.prisma.user.findFirst({
      where: { emailNormalized: email },
      select: { authIdentities: true },
    });
    expect(user?.authIdentities.map((i) => i.provider).sort()).toEqual(['GOOGLE', 'MICROSOFT']);
    // Single use.
    expect((await h.client().post('/auth/oauth/link/confirm', { token })).status).toBe(400);
  });

  it('refuses a forged state, a missing state cookie, a replayed code and an unverified email', async () => {
    expect(
      (await oauth(h.client(), 'google', h.email('forged'), { tamperState: true })).location,
    ).toMatch(/error=oauth_state/);

    const client = h.client();
    const start = await client.get('/auth/oauth/google/start');
    const url = new URL(start.headers.location as string);
    const authorize = await client.get(
      `/auth/oauth/fake/google/authorize?${new URLSearchParams({ state: url.searchParams.get('state')!, nonce: url.searchParams.get('nonce')!, email: h.email('nocookie'), verified: '1' }).toString()}`,
    );
    const path = apiPath(authorize.headers.location as string);
    // No state cookie at all.
    expect((await client.get(path)).headers.location).toMatch(/error=oauth_state/);
    // With the cookie, the (already used?) code: first use works, replay fails.
    const cookie = withCookies(client, { [STATE_COOKIE]: setCookie(start, STATE_COOKIE) });
    expect((await client.get(path, cookie)).headers.location).not.toMatch(/error=/);
    expect((await client.get(path, cookie)).headers.location).toMatch(/error=oauth_failed/);

    expect(
      (await oauth(h.client(), 'google', h.email('unverified'), { verified: false })).location,
    ).toMatch(/error=oauth_unverified_email/);
  });

  it('ignores open-redirect attempts in next', async () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example']) {
      const flow = await oauth(h.client(), 'google', h.email(`next-${next.length}`), { next });
      expect(new URL(flow.location).origin).toBe(h.env.APP_ORIGIN);
      expect(flow.location).not.toContain('evil.example');
    }
  });

  it('connects and disconnects sign-in methods from settings, never the last one', async () => {
    const user = await h.verifiedUser('oauth-connect');
    const linked = await oauth(user.client, 'google', h.email('other-google-address'), {
      intent: 'link',
      next: '/settings',
    });
    expect(linked.location).toMatch(/\/settings$/);
    const list = await user.client.get('/auth/identities');
    expect(list.body.data).toHaveLength(1);
    const id = list.body.data[0].id as string;

    // Disconnecting needs recent auth (sessions start re-authenticated only after a password check).
    await h.prisma.session.updateMany({
      where: { userId: user.id },
      data: { reauthenticatedAt: null },
    });
    await h.flushSessionCache();
    expect((await user.client.delete(`/auth/identities/${id}`)).status).toBe(403);
    await user.client.post('/auth/reauthenticate', { password: STRONG_PASSWORD });
    expect((await user.client.delete(`/auth/identities/${id}`)).status).toBe(204);

    // An identity already linked to someone else cannot be connected.
    const otherEmail = h.email('owner-of-identity');
    await oauth(h.client(), 'microsoft', otherEmail);
    expect(
      (await oauth(user.client, 'microsoft', otherEmail, { intent: 'link' })).location,
    ).toMatch(/error=oauth_identity_in_use/);

    // OAuth-only account: its only identity cannot be removed.
    const solo = h.client();
    await oauth(solo, 'google', h.email('solo'));
    await h.prisma.session.updateMany({
      where: { userId: (await solo.get('/auth/me')).body.user.id },
      data: { reauthenticatedAt: new Date() },
    });
    await h.flushSessionCache();
    const soloId = (await solo.get('/auth/identities')).body.data[0].id as string;
    expect((await solo.delete(`/auth/identities/${soloId}`)).status).toBe(409);

    // Another user's identity id is a 404.
    expect((await user.client.delete(`/auth/identities/${soloId}`)).status).toBe(404);
  });

  it('refuses the fake identity provider pages for unknown providers', async () => {
    expect((await h.client().get('/auth/oauth/github/start')).status).toBe(404);
    expect((await h.client().get('/auth/oauth/fake/github')).status).toBe(404);
  });
});
