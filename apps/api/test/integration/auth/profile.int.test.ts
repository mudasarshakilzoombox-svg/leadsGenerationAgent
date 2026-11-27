/* eslint-disable @typescript-eslint/no-unsafe-member-access -- supertest bodies are untyped JSON; each assertion checks their shape. */
// Profile settings (PRD AUTH-06, 08-authentication §4.5): name/time zone, password change and
// email change with verification of the new address and a revert link to the old one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness, STRONG_PASSWORD } from './harness.js';

let h: Harness;
beforeAll(async () => {
  h = await Harness.create();
});
afterAll(async () => h?.close());

const NEW_PASSWORD = 'an entirely new passphrase 77';

describe('profile (AUTH-06 AC1)', () => {
  it('updates name and time zone, validating the time zone', async () => {
    const user = await h.verifiedUser('profile-edit');
    expect(
      (await user.client.patch('/auth/me', { name: 'Ada Lovelace', timezone: 'Europe/London' }))
        .status,
    ).toBe(204);
    expect((await user.client.get('/auth/me')).body.user).toMatchObject({
      name: 'Ada Lovelace',
      timezone: 'Europe/London',
    });
    expect((await user.client.patch('/auth/me', { timezone: 'Mars/Olympus' })).status).toBe(400);
    expect((await user.client.patch('/auth/me', {})).status).toBe(400);
    // Mass assignment is refused.
    expect(
      (await user.client.patch('/auth/me', { name: 'X', email: 'x@evil.example' })).status,
    ).toBe(400);
    expect((await h.client().patch('/auth/me', { name: 'Nobody' })).status).toBe(401);
  });

  it('changes the password with the current one, signs out other sessions and emails a notice', async () => {
    const user = await h.verifiedUser('profile-pw');
    const other = h.client();
    expect(
      (await other.post('/auth/login', { email: user.email, password: STRONG_PASSWORD })).status,
    ).toBe(200);

    const wrong = await user.client.post('/auth/password/change', {
      currentPassword: 'not it at all 1',
      newPassword: NEW_PASSWORD,
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors[0]).toMatchObject({ pointer: '/currentPassword' });
    const same = await user.client.post('/auth/password/change', {
      currentPassword: STRONG_PASSWORD,
      newPassword: STRONG_PASSWORD,
    });
    expect(same.body.errors?.[0]).toMatchObject({ pointer: '/newPassword' });

    const ok = await user.client.post('/auth/password/change', {
      currentPassword: STRONG_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(ok.status).toBe(204);
    expect((await user.client.get('/auth/me')).status).toBe(200); // this session stays
    expect((await other.get('/auth/me')).status).toBe(401); // others are signed out
    expect(await h.lastEmail(user.email, 'auth.password_changed')).toBeDefined();
    expect(
      (await h.client().post('/auth/login', { email: user.email, password: NEW_PASSWORD })).status,
    ).toBe(200);
  });
});

describe('email change (AUTH-06 AC2)', () => {
  it('requires recent auth, verifies the new address, notifies the old one and can be reverted', async () => {
    const user = await h.verifiedUser('email-old');
    const newEmail = h.email('email-new');

    await h.prisma.session.updateMany({
      where: { userId: user.id },
      data: { reauthenticatedAt: null },
    });
    await h.flushSessionCache();
    const stale = await user.client.post('/auth/email/change', { newEmail });
    expect(stale.status).toBe(403);
    expect(stale.body.code).toBe('REAUTH_REQUIRED');
    await user.client.post('/auth/reauthenticate', { password: STRONG_PASSWORD });

    expect((await user.client.post('/auth/email/change', { newEmail })).status).toBe(202);
    // The link goes to the NEW address; nothing changes until it is used.
    const token = await h.tokenFrom(newEmail, 'auth.email_change_verify');
    expect(h.emailsFor(user.email, 'auth.email_change_verify')).toHaveLength(0);
    expect((await user.client.get('/auth/me')).body.user.email).toBe(user.email);

    expect((await h.client().post('/auth/email/confirm', { token })).status).toBe(204);
    expect((await user.client.get('/auth/me')).body.user).toMatchObject({
      email: newEmail,
      emailVerified: true,
    });
    expect((await h.client().post('/auth/email/confirm', { token })).status).toBe(400); // single use

    // The OLD address gets a notice with a revert link that names the new address masked.
    const notice = await h.lastEmail(user.email, 'auth.email_changed');
    expect(notice?.text).toContain('***@');
    expect(notice?.text).not.toContain(newEmail);
    const revert = await h.tokenFrom(user.email, 'auth.email_changed');
    expect((await h.client().post('/auth/email/revert', { token: revert })).status).toBe(204);
    expect((await user.client.get('/auth/me')).status).toBe(401); // every session revoked
    const restored = await h.prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    expect(restored?.email).toBe(user.email);
    expect(
      (await h.client().post('/auth/login', { email: user.email, password: STRONG_PASSWORD }))
        .status,
    ).toBe(200);
  });

  it('answers the same for a taken address and sends nothing', async () => {
    const user = await h.verifiedUser('email-taken-a');
    const other = await h.verifiedUser('email-taken-b');
    await user.client.post('/auth/reauthenticate', { password: STRONG_PASSWORD });
    const res = await user.client.post('/auth/email/change', { newEmail: other.email });
    expect(res.status).toBe(202);
    await h.drainNotifications();
    expect(h.emailsFor(other.email, 'auth.email_change_verify')).toHaveLength(0);
    expect((await user.client.post('/auth/email/change', { newEmail: user.email })).status).toBe(
      400,
    );
  });

  it('rejects unknown, malformed and cross-purpose tokens', async () => {
    const user = await h.verifiedUser('email-tokens');
    // A verification token for another purpose must not confirm an email change.
    await user.client.post('/auth/reauthenticate', { password: STRONG_PASSWORD });
    const target = h.email('email-tokens-new');
    await user.client.post('/auth/email/change', { newEmail: target });
    const changeToken = await h.tokenFrom(target, 'auth.email_change_verify');
    expect((await h.client().post('/auth/email/revert', { token: changeToken })).status).toBe(400);
    expect((await h.client().post('/auth/oauth/link/confirm', { token: changeToken })).status).toBe(
      400,
    );
    expect((await h.client().post('/auth/email/confirm', { token: 'x'.repeat(43) })).status).toBe(
      400,
    );
  });
});
