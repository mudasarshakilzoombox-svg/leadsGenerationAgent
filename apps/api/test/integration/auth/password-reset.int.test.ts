// PRD AUTH-05 (password reset), 08-authentication.md §4.4.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness } from './harness.js';

let h: Harness;
beforeAll(async () => {
  h = await Harness.create();
});
afterAll(async () => h?.close());

const NEW_PASSWORD = 'an entirely new passphrase 7';

describe('password reset (AUTH-05)', () => {
  it('gives the same answer for unknown emails and only emails real accounts', async () => {
    const user = await h.verifiedUser('known');
    const known = await h.client().post('/auth/password/forgot', { email: user.email });
    const ghost = h.email('ghost');
    const unknown = await h.client().post('/auth/password/forgot', { email: ghost });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(await h.lastEmail(user.email, 'auth.password_reset')).toBeDefined();
    expect(h.mailer.to(ghost)).toHaveLength(0);
  });

  it('builds links from APP_ORIGIN, never from the Host header (reset poisoning)', async () => {
    const user = await h.verifiedUser('poison');
    await h.client().request(
      'post',
      '/auth/password/forgot',
      { email: user.email },
      {
        Host: 'evil.example',
        'X-Forwarded-Host': 'evil.example',
      },
    );
    const mail = await h.lastEmail(user.email, 'auth.password_reset');
    expect(mail?.text).toContain(`${h.env.APP_ORIGIN}/reset-password?token=`);
    expect(mail?.text).not.toContain('evil.example');
  });

  it('resets once, signs out every session, confirms by email and changes the password', async () => {
    const user = await h.verifiedUser('reset');
    const other = h.client();
    expect(
      (await other.post('/auth/login', { email: user.email, password: user.password })).status,
    ).toBe(200);
    expect((await user.client.get('/auth/me')).status).toBe(200); // cached

    await h.client().post('/auth/password/forgot', { email: user.email });
    const token = await h.tokenFrom(user.email, 'auth.password_reset');
    const res = await h.client().post('/auth/password/reset', { token, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(204);

    expect((await user.client.get('/auth/me')).status).toBe(401);
    expect((await other.get('/auth/me')).status).toBe(401);
    expect(await h.lastEmail(user.email, 'auth.password_changed')).toBeDefined();
    expect(
      (await h.client().post('/auth/login', { email: user.email, password: user.password })).status,
    ).toBe(401);
    expect(
      (await h.client().post('/auth/login', { email: user.email, password: NEW_PASSWORD })).status,
    ).toBe(200);

    const reuse = await h
      .client()
      .post('/auth/password/reset', { token, newPassword: 'yet another passphrase 99' });
    expect(reuse.status).toBe(400);
    expect(reuse.body).toMatchObject({ errors: [{ pointer: '/token', code: 'token_invalid' }] });
  });

  it('rejects expired links, weak or breached new passwords, and keeps only the newest link valid', async () => {
    const user = await h.verifiedUser('rules');
    const client = h.client();
    await client.post('/auth/password/forgot', { email: user.email });
    const first = await h.tokenFrom(user.email, 'auth.password_reset');
    await client.post('/auth/password/forgot', { email: user.email });
    const second = await h.tokenFrom(user.email, 'auth.password_reset');
    expect(
      (await h.client().post('/auth/password/reset', { token: first, newPassword: NEW_PASSWORD }))
        .status,
    ).toBe(400);

    const weak = await h
      .client()
      .post('/auth/password/reset', { token: second, newPassword: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body).toMatchObject({ errors: [{ pointer: '/newPassword' }] });
    const breached = await h
      .client()
      .post('/auth/password/reset', { token: second, newPassword: 'password1234' });
    expect(breached.body).toMatchObject({
      errors: [{ pointer: '/newPassword', code: 'password_breached' }],
    });

    await h.prisma.passwordReset.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await h.client().post('/auth/password/reset', { token: second, newPassword: NEW_PASSWORD }))
        .status,
    ).toBe(400);
  });

  it('sends at most 3 reset emails per hour per account, silently', async () => {
    const user = await h.verifiedUser('limit');
    const client = h.client();
    for (let i = 0; i < 4; i++) {
      expect((await client.post('/auth/password/forgot', { email: user.email })).status).toBe(202);
    }
    await h.drainNotifications();
    expect(h.emailsFor(user.email, 'auth.password_reset')).toHaveLength(3);
  });

  it('enforces 10 auth requests per minute per IP', async () => {
    const client = h.client();
    for (let i = 0; i < 10; i++)
      await client.post('/auth/password/forgot', { email: h.email(`burst${i}`) });
    const blocked = await client.post('/auth/password/forgot', { email: h.email('burst-over') });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
