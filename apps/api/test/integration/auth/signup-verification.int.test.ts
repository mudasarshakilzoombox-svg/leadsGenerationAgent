// PRD AUTH-01 (registration) and AUTH-02 (email verification), plus CSRF on auth endpoints.
import { CURRENT_TERMS_VERSION } from '@lga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../../../src/auth/cookies.js';
import { Harness, STRONG_PASSWORD } from './harness.js';

let h: Harness;
beforeAll(async () => {
  h = await Harness.create();
});
afterAll(async () => h?.close());

function signupBody(email: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Jane Tester',
    email,
    password: STRONG_PASSWORD,
    acceptTerms: true,
    termsVersion: CURRENT_TERMS_VERSION,
    turnstileToken: 'fake-ok',
    ...overrides,
  };
}

describe('signup (AUTH-01)', () => {
  it('creates an unverified user, sends a verification link and sets no session', async () => {
    const client = h.client();
    const email = h.email('new');
    const res = await client.post('/auth/signup', signupBody(email));
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'accepted' });
    expect(res.headers['set-cookie']).toBeUndefined();

    const user = await h.prisma.user.findFirst({ where: { emailNormalized: email } });
    expect(user).toMatchObject({
      emailVerifiedAt: null,
      termsVersionAccepted: CURRENT_TERMS_VERSION,
    });
    expect(user!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);

    const mail = await h.lastEmail(email, 'auth.verify_email');
    expect(mail?.text).toContain(`${h.env.APP_ORIGIN}/verify-email?token=`);
    // Only the hash is stored.
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail!.text)![1]!;
    const stored = await h.prisma.verificationToken.findMany({ where: { userId: user!.id } });
    expect(stored).toHaveLength(1);
    expect(Buffer.from(stored[0]!.tokenHash).toString('utf8')).not.toContain(token);
  });

  it('answers an existing email exactly like a new one and notifies the owner instead', async () => {
    const existing = await h.signup('dup');
    const res1 = await h.client().post('/auth/signup', signupBody(h.email('fresh')));
    const res2 = await h.client().post('/auth/signup', signupBody(existing.email.toUpperCase()));
    expect(res2.status).toBe(res1.status);
    expect(res2.body).toEqual(res1.body);
    expect(await h.prisma.user.count({ where: { emailNormalized: existing.email } })).toBe(1);
    expect(await h.lastEmail(existing.email, 'auth.signup_existing')).toBeDefined();
  });

  it.each([
    ['a short password', { password: 'short' }, '/password'],
    ['a breached password', { password: 'password1234' }, '/password'],
    ['a failed security check', { turnstileToken: 'fake-fail' }, '/turnstileToken'],
    ['unaccepted terms', { acceptTerms: false }, '/acceptTerms'],
    ['an outdated terms version', { termsVersion: '2020-01' }, '/termsVersion'],
    ['a role field', { role: 'OWNER' }, ''],
    ['a workspaceId field', { workspaceId: '0195f000-0000-7000-8000-000000000001' }, ''],
  ])('rejects %s', async (_label, overrides, pointer) => {
    const email = h.email('invalid');
    const res = await h.client().post('/auth/signup', signupBody(email, overrides));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    if (pointer) {
      expect(
        (res.body as { errors: { pointer: string }[] }).errors.map((e) => e.pointer),
      ).toContain(pointer);
    }
    expect(await h.prisma.user.count({ where: { emailNormalized: email } })).toBe(0);
  });

  it('limits sign-ups to 5 per hour per IP', async () => {
    const client = h.client();
    for (let i = 0; i < 5; i++) {
      expect((await client.post('/auth/signup', signupBody(h.email(`ip${i}`)))).status).toBe(202);
    }
    const blocked = await client.post('/auth/signup', signupBody(h.email('ip-over')));
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('rejects requests without the CSRF header or from another origin', async () => {
    const body = signupBody(h.email('csrf'));
    const noHeader = await h
      .client()
      .request('post', '/auth/signup', body, { 'X-Requested-With': '' });
    expect(noHeader.status).toBe(403);
    expect(noHeader.body).toMatchObject({ code: 'ORIGIN_REJECTED' });
    const evil = await h.client().request(
      'post',
      '/auth/login',
      { email: 'a@b.test', password: 'x' },
      {
        Origin: 'https://evil.example',
      },
    );
    expect(evil.status).toBe(403);
  });
});

describe('email verification (AUTH-02)', () => {
  it('verifies once, signs the user in with a hardened cookie, and rejects reuse', async () => {
    const { client, email } = await h.signup('verify');
    const token = await h.tokenFrom(email, 'auth.verify_email');

    const res = await client.post('/auth/verify-email', { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { email, emailVerified: true } });
    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith(SESSION_COOKIE));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);

    const me = await client.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ user: { email, emailVerified: true }, memberships: [] });

    const reuse = await h.client().post('/auth/verify-email', { token });
    expect(reuse.status).toBe(400);
    expect(reuse.body).toMatchObject({ errors: [{ pointer: '/token', code: 'token_invalid' }] });
  });

  it('rejects expired and malformed links', async () => {
    const { email } = await h.signup('expired');
    const token = await h.tokenFrom(email, 'auth.verify_email');
    await h.prisma.verificationToken.updateMany({
      where: { user: { emailNormalized: email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await h.client().post('/auth/verify-email', { token })).status).toBe(400);
    expect((await h.client().post('/auth/verify-email', { token: 'not a token' })).status).toBe(
      400,
    );
  });

  it('resends a fresh link (the old one stops working), at most 3 per hour, and says nothing about unknown emails', async () => {
    const { email } = await h.signup('resend');
    const first = await h.tokenFrom(email, 'auth.verify_email');
    const client = h.client();

    const resent = await client.post('/auth/verify-email/resend', { email });
    expect(resent.status).toBe(202);
    const second = await h.tokenFrom(email, 'auth.verify_email');
    expect(second).not.toBe(first);
    expect((await h.client().post('/auth/verify-email', { token: first })).status).toBe(400);

    await client.post('/auth/verify-email/resend', { email });
    await client.post('/auth/verify-email/resend', { email });
    const fourth = await client.post('/auth/verify-email/resend', { email });
    expect(fourth.status).toBe(202);
    await h.drainNotifications();
    // Signup email + 3 resends; the 4th was dropped silently.
    expect(h.emailsFor(email, 'auth.verify_email')).toHaveLength(4);

    const unknown = await client.post('/auth/verify-email/resend', { email: h.email('nobody') });
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(resent.body);
    // Each resend minted a newer link, so only the latest one works.
    expect((await h.client().post('/auth/verify-email', { token: second })).status).toBe(400);
    const latest = await h.tokenFrom(email, 'auth.verify_email');
    expect((await h.client().post('/auth/verify-email', { token: latest })).status).toBe(200);
  });

  it('lets unverified users sign in (AUTH-02 AC3) and reports them as unverified', async () => {
    const { email, password } = await h.signup('unverified');
    const client = h.client();
    const res = await client.post('/auth/login', { email, password });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { emailVerified: false } });
    expect((await client.get('/auth/me')).body).toMatchObject({ user: { emailVerified: false } });
  });

  it('records audit events for signup and verification', async () => {
    const user = await h.verifiedUser('audited');
    const actions = await h.prisma.auditLog.findMany({
      where: { actorUserId: user.id },
      select: { action: true },
    });
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['auth.signed_up', 'auth.email_verified']),
    );
  });
});
