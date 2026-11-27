// PRD AUTH-04 (login, sessions), 08-authentication.md §4.2, §5, §6, §7.
import { emailKey, LOGIN_THROTTLE, normalizeEmail, valkeyKey } from '@lga/core';
import { sleep } from '@lga/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness, STRONG_PASSWORD, stableProblem } from './harness.js';

let h: Harness;
beforeAll(async () => {
  h = await Harness.create();
});
afterAll(async () => h?.close());

describe('login', () => {
  it('signs in with a hardened, rotated session cookie', async () => {
    const user = await h.verifiedUser('login');
    const verifyCookie = user.client.cookie;
    const res = await user.client.post('/auth/login', {
      email: user.email,
      password: user.password,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { id: user.id, email: user.email } });
    expect(user.client.cookie).toBeDefined();
    // Session fixation defense: the session presented at login was replaced and revoked.
    expect(user.client.cookie).not.toBe(verifyCookie);
    const stale = h.client();
    stale.cookie = verifyCookie;
    expect((await stale.get('/auth/me')).status).toBe(401);
    expect((await user.client.get('/auth/me')).status).toBe(200);

    const session = await h.prisma.session.findFirst({
      where: { userId: user.id, revokedAt: null },
    });
    expect(session?.ip).toBe(user.client.ip);
    expect(session!.absoluteExpiresAt.getTime() - session!.createdAt.getTime()).toBe(
      30 * 86_400_000,
    );
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const user = await h.verifiedUser('generic');
    const wrong = await h
      .client()
      .post('/auth/login', { email: user.email, password: 'wrong password here' });
    const unknown = await h
      .client()
      .post('/auth/login', { email: h.email('ghost'), password: 'wrong password here' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(stableProblem(wrong)).toEqual(stableProblem(unknown));
    expect((wrong.body as { detail: string }).detail).toBe('Email or password is incorrect.');
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('requires the security check after 3 failures and delays progressively after 5', async () => {
    const user = await h.verifiedUser('throttle');
    const client = h.client();
    const attempt = (password: string, turnstileToken?: string) =>
      client.post('/auth/login', {
        email: user.email,
        password,
        ...(turnstileToken ? { turnstileToken } : {}),
      });

    for (let i = 0; i < LOGIN_THROTTLE.captchaAfterAccount; i++)
      expect((await attempt('wrong password!')).status).toBe(401);
    const noCaptcha = await attempt('wrong password!');
    expect(noCaptcha.status).toBe(400);
    expect(noCaptcha.body).toMatchObject({
      errors: [{ pointer: '/turnstileToken', code: 'captcha_required' }],
    });
    expect((await attempt(user.password, 'fake-fail')).body).toMatchObject({
      errors: [{ code: 'captcha_failed' }],
    });

    expect((await attempt('wrong password!', 'fake-ok')).status).toBe(401); // 4th failure
    expect((await attempt('wrong password!', 'fake-ok')).status).toBe(401); // 5th: 1 s delay starts
    const delayed = await attempt(user.password, 'fake-ok');
    expect(delayed.status).toBe(429);
    expect(delayed.headers['retry-after']).toBe('1');

    await sleep(1_100);
    expect((await attempt(user.password, 'fake-ok')).status).toBe(200);
    // Success resets the account counter: no captcha needed any more.
    expect(
      (await h.client().post('/auth/login', { email: user.email, password: user.password })).status,
    ).toBe(200);
  });

  it('pauses sign-in for an hour after 20 failures in 24 h, emails the owner, and a reset unlocks it', async () => {
    const user = await h.verifiedUser('lockout');
    const account = emailKey(normalizeEmail(user.email), h.env.EMAIL_HASH_PEPPER);
    await h.redis.set(
      valkeyKey(h.env, 'rl', 'auth:fail:acct24', account),
      String(LOGIN_THROTTLE.lockAfter - 1),
      'EX',
      3600,
    );

    expect(
      (await h.client().post('/auth/login', { email: user.email, password: 'wrong password!' }))
        .status,
    ).toBe(401);
    const locked = await h.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
    expect(await h.lastEmail(user.email, 'auth.account_locked')).toBeDefined();
    // Even the right password is refused, with the same generic answer.
    const right = await h
      .client()
      .post('/auth/login', { email: user.email, password: user.password });
    expect(right.status).toBe(401);

    await h.client().post('/auth/password/forgot', { email: user.email });
    const token = await h.tokenFrom(user.email, 'auth.password_reset');
    const newPassword = 'a brand new passphrase 2026';
    expect((await h.client().post('/auth/password/reset', { token, newPassword })).status).toBe(
      204,
    );
    expect(
      (await h.client().post('/auth/login', { email: user.email, password: newPassword })).status,
    ).toBe(200);
    const actions = await h.prisma.auditLog.findMany({
      where: { actorUserId: user.id },
      select: { action: true },
    });
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['auth.login_failed', 'auth.account_locked', 'auth.password_reset']),
    );
  });

  it('emails a new-device notice for an unfamiliar browser and network, not for a known one', async () => {
    const user = await h.verifiedUser('device');
    await user.client.post('/auth/login', { email: user.email, password: user.password });
    await h.drainNotifications();
    expect(h.emailsFor(user.email, 'auth.new_device')).toHaveLength(0);

    const phone = h.client();
    phone.userAgent =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
    expect(
      (await phone.post('/auth/login', { email: user.email, password: user.password })).status,
    ).toBe(200);
    expect(await h.lastEmail(user.email, 'auth.new_device')).toBeDefined();
  });

  it('rehashes passwords stored with weaker argon2 parameters on login', async () => {
    const user = await h.verifiedUser('rehash');
    expect(user.password).toBe(STRONG_PASSWORD);
    // argon2id(STRONG_PASSWORD) with m=4096, t=1 (weaker than the current baseline).
    const weakHash =
      '$argon2id$v=19$m=4096,t=1,p=1$sZNxRzn5gYQ6YPNPsIC7vA$PwGLo1PcHTZpRTugxLPAdPRN0/DLwZVbOTLoCG4Mat4';
    await h.prisma.user.update({ where: { id: user.id }, data: { passwordHash: weakHash } });
    expect(
      (await h.client().post('/auth/login', { email: user.email, password: user.password })).status,
    ).toBe(200);
    const row = await h.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).toMatch(/\$m=19456,t=2,p=1\$/);
  });
});

describe('sessions', () => {
  it('rejects requests without a session', async () => {
    const res = await h.client().get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    const bogus = h.client();
    bogus.cookie = 'A'.repeat(43);
    expect((await bogus.get('/auth/me')).status).toBe(401);
  });

  it('logs out: revokes the session, clears the cookie and rejects it immediately', async () => {
    const user = await h.verifiedUser('logout');
    const cookie = user.client.cookie;
    expect((await user.client.get('/auth/me')).status).toBe(200); // now cached in Valkey
    const res = await user.client.post('/auth/logout');
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(
      /__Host-lga_session=;.*Expires=Thu, 01 Jan 1970/,
    );
    const replay = h.client();
    replay.cookie = cookie;
    expect((await replay.get('/auth/me')).status).toBe(401);
  });

  it('expires sessions after 7 idle days and after 30 days regardless of activity', async () => {
    const idle = await h.verifiedUser('idle');
    await h.prisma.session.updateMany({
      where: { userId: idle.id },
      data: { idleExpiresAt: new Date(Date.now() - 1000) },
    });
    await h.flushSessionCache();
    expect((await idle.client.get('/auth/me')).status).toBe(401);

    const old = await h.verifiedUser('absolute');
    await h.prisma.session.updateMany({
      where: { userId: old.id },
      data: { absoluteExpiresAt: new Date(Date.now() - 1000) },
    });
    await h.flushSessionCache();
    expect((await old.client.get('/auth/me')).status).toBe(401);
  });

  it('slides the idle expiry on activity, writing at most every 10 minutes', async () => {
    const user = await h.verifiedUser('slide');
    const past = new Date(Date.now() - 11 * 60_000);
    await h.prisma.session.updateMany({
      where: { userId: user.id },
      data: { lastSeenAt: past, idleExpiresAt: new Date(Date.now() + 60_000) },
    });
    await h.flushSessionCache();
    expect((await user.client.get('/auth/me')).status).toBe(200);
    const session = await h.prisma.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    expect(session.lastSeenAt.getTime()).toBeGreaterThan(past.getTime());
    expect(session.idleExpiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });

  it('lists sessions, revokes one immediately despite the cache, and revokes all others', async () => {
    const user = await h.verifiedUser('multi');
    const laptop = user.client;
    const phone = h.client();
    expect(
      (await phone.post('/auth/login', { email: user.email, password: user.password })).status,
    ).toBe(200);
    const tablet = h.client();
    expect(
      (await tablet.post('/auth/login', { email: user.email, password: user.password })).status,
    ).toBe(200);
    expect((await phone.get('/auth/me')).status).toBe(200); // cached

    const list = await laptop.get('/auth/sessions');
    expect(list.status).toBe(200);
    const sessions = (list.body as { data: { id: string; current: boolean; ip: string }[] }).data;
    expect(sessions).toHaveLength(3);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    const phoneSession = sessions.find((s) => s.ip === phone.ip)!;

    expect((await laptop.delete(`/auth/sessions/${phoneSession.id}`)).status).toBe(204);
    expect((await phone.get('/auth/me')).status).toBe(401);

    expect((await laptop.post('/auth/sessions/revoke-others')).status).toBe(204);
    expect((await tablet.get('/auth/me')).status).toBe(401);
    expect((await laptop.get('/auth/me')).status).toBe(200);
  });

  it("cannot see or revoke another user's sessions", async () => {
    const alice = await h.verifiedUser('alice');
    const bob = await h.verifiedUser('bob');
    const bobSession = await h.prisma.session.findFirstOrThrow({
      where: { userId: bob.id, revokedAt: null },
    });
    const list = await alice.client.get('/auth/sessions');
    expect((list.body as { data: { id: string }[] }).data.map((s) => s.id)).not.toContain(
      bobSession.id,
    );
    expect((await alice.client.delete(`/auth/sessions/${bobSession.id}`)).status).toBe(404);
    expect((await alice.client.delete('/auth/sessions/not-a-uuid')).status).toBe(404);
    expect((await bob.client.get('/auth/me')).status).toBe(200);
  });

  it('re-authenticates with the password (step-up) and counts wrong passwords as failures', async () => {
    const user = await h.verifiedUser('stepup');
    await h.prisma.session.updateMany({
      where: { userId: user.id },
      data: { reauthenticatedAt: new Date(Date.now() - 3600_000) },
    });
    await h.flushSessionCache();
    expect(
      (await user.client.post('/auth/reauthenticate', { password: 'wrong password!' })).status,
    ).toBe(401);
    expect(
      (await user.client.post('/auth/reauthenticate', { password: user.password })).status,
    ).toBe(204);
    const session = await h.prisma.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    expect(session.reauthenticatedAt!.getTime()).toBeGreaterThan(Date.now() - 10_000);
  });
});
