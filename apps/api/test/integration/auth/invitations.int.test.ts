// PRD WS-03 (invitations): seats, idempotency, acceptance rules, token lifecycle.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness, type TestUser } from './harness.js';

let h: Harness;
let owner: TestUser;
let workspaceId: string;

beforeAll(async () => {
  h = await Harness.create();
  owner = await h.verifiedUser('inviter');
  workspaceId = await h.createWorkspace(owner.client, 'Invite Co');
});
afterAll(async () => h?.close());

let keyCounter = 0;
const key = () => `invite-key-${Date.now()}-${keyCounter++}`;
const invite = (email: string, roleKey = 'MEMBER', idempotencyKey = key()) =>
  owner.client.post(
    `/workspaces/${workspaceId}/invitations`,
    { email, roleKey },
    { 'Idempotency-Key': idempotencyKey },
  );

describe('creating invitations', () => {
  it('invites by email, emails a link and shows a safe preview', async () => {
    const email = h.email('preview');
    const res = await invite(email, 'ADMIN');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email, roleKey: 'ADMIN', status: 'PENDING' });

    const token = await h.tokenFrom(email, 'workspace.invitation');
    const mail = await h.lastEmail(email, 'workspace.invitation');
    expect(mail?.text).toContain(`${h.env.APP_ORIGIN}/invitations/accept?token=`);
    expect(mail?.subject).toContain('Invite Co');

    const lookup = await h.client().get(`/invitations/lookup?token=${token}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body).toMatchObject({ workspaceName: 'Invite Co', roleKey: 'ADMIN' });
    expect((lookup.body as { emailHint: string }).emailHint).toMatch(/^p\*\*\*@/);
    expect((await h.client().get('/invitations/lookup?token=garbage')).status).toBe(404);
    expect(
      await h.prisma.auditLog.count({ where: { workspaceId, action: 'invitation.created' } }),
    ).toBeGreaterThan(0);
    await owner.client.delete(
      `/workspaces/${workspaceId}/invitations/${(res.body as { id: string }).id}`,
    );
  });

  it('replays the same Idempotency-Key and rejects it for a different body', async () => {
    const email = h.email('idem');
    const idem = key();
    const first = await invite(email, 'MEMBER', idem);
    const replay = await invite(email, 'MEMBER', idem);
    expect(replay.status).toBe(first.status);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect((replay.body as { id: string }).id).toBe((first.body as { id: string }).id);
    expect(
      await h.prisma.invitation.count({ where: { workspaceId, emailNormalized: email } }),
    ).toBe(1);

    const conflict = await invite(h.email('other'), 'MEMBER', idem);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    const missing = await owner.client.post(`/workspaces/${workspaceId}/invitations`, {
      email: h.email('nokey'),
      roleKey: 'MEMBER',
    });
    expect(missing.status).toBe(400);
    await owner.client.delete(
      `/workspaces/${workspaceId}/invitations/${(first.body as { id: string }).id}`,
    );
  });

  it('refuses duplicates: an existing member or a pending invitation', async () => {
    const email = h.email('dupe');
    const first = await invite(email);
    expect(first.status).toBe(201);
    expect((await invite(email)).status).toBe(409);
    expect((await invite(owner.email)).status).toBe(409);
    await owner.client.delete(
      `/workspaces/${workspaceId}/invitations/${(first.body as { id: string }).id}`,
    );
  });

  it('enforces the seat limit, counting pending invitations (trial = 2 seats)', async () => {
    const pending = await invite(h.email('seat1'));
    expect(pending.status).toBe(201);
    const over = await invite(h.email('seat2'));
    expect(over.status).toBe(402);
    expect(over.body).toMatchObject({
      code: 'QUOTA_EXCEEDED',
      limit: { key: 'seats', used: 2, limit: 2 },
    });
    // Revoking frees the seat.
    expect(
      (
        await owner.client.delete(
          `/workspaces/${workspaceId}/invitations/${(pending.body as { id: string }).id}`,
        )
      ).status,
    ).toBe(204);
    const freed = await invite(h.email('seat3'));
    expect(freed.status).toBe(201);
    await owner.client.delete(
      `/workspaces/${workspaceId}/invitations/${(freed.body as { id: string }).id}`,
    );
  });

  it('requires a verified email to invite', async () => {
    const { email, password } = await h.signup('unverified-owner');
    const client = h.client();
    await client.post('/auth/login', { email, password });
    const created = await client.post('/workspaces', { name: 'Unverified Co' });
    expect(created.status).toBe(201);
    h.trackWorkspace((created.body as { id: string }).id);
    const res = await client.post(
      `/workspaces/${(created.body as { id: string }).id}/invitations`,
      { email: h.email('x'), roleKey: 'MEMBER' },
      { 'Idempotency-Key': key() },
    );
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });
});

describe('accepting invitations', () => {
  it('joins with the invited role, verifies the email, and the token works once', async () => {
    const { client, email, password } = await h.signup('joiner');
    const res = await invite(email, 'READ_ONLY');
    expect(res.status).toBe(201);
    const token = await h.tokenFrom(email, 'workspace.invitation');
    await client.post('/auth/login', { email, password });

    // The role comes from the invitation; a roleKey in the body is rejected outright.
    expect((await client.post('/invitations/accept', { token, roleKey: 'ADMIN' })).status).toBe(
      400,
    );
    const accepted = await client.post('/invitations/accept', { token });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      workspace: { id: workspaceId },
      roleKey: 'READ_ONLY',
      permissions: ['analytics.view'],
    });

    const me = await client.get('/auth/me');
    expect(me.body).toMatchObject({ user: { emailVerified: true } });
    expect((await client.post('/invitations/accept', { token })).status).toBe(404);
    expect(
      await h.prisma.auditLog.count({ where: { workspaceId, action: 'invitation.accepted' } }),
    ).toBeGreaterThan(0);

    // READ_ONLY members cannot invite.
    expect(
      (
        await client.post(
          `/workspaces/${workspaceId}/invitations`,
          { email: h.email('y'), roleKey: 'MEMBER' },
          { 'Idempotency-Key': key() },
        )
      ).status,
    ).toBe(403);
    await owner.client.delete(
      `/workspaces/${workspaceId}/members/${(accepted.body as { membershipId: string }).membershipId}`,
    );
  });

  it('requires a session with the invited email', async () => {
    const email = h.email('target');
    const created = await invite(email);
    const token = await h.tokenFrom(email, 'workspace.invitation');
    expect((await h.client().post('/invitations/accept', { token })).status).toBe(401);
    const intruder = await h.verifiedUser('intruder');
    const res = await intruder.client.post('/invitations/accept', { token });
    expect(res.status).toBe(403);
    expect(
      await h.prisma.workspaceMember.count({ where: { workspaceId, userId: intruder.id } }),
    ).toBe(0);
    await owner.client.delete(
      `/workspaces/${workspaceId}/invitations/${(created.body as { id: string }).id}`,
    );
  });

  it('rejects revoked and expired invitations, and a resend invalidates the old link', async () => {
    const user = await h.verifiedUser('lifecycle');
    const created = await invite(user.email);
    const id = (created.body as { id: string }).id;
    const oldToken = await h.tokenFrom(user.email, 'workspace.invitation');

    expect(
      (await owner.client.post(`/workspaces/${workspaceId}/invitations/${id}/resend`)).status,
    ).toBe(202);
    const newToken = await h.tokenFrom(user.email, 'workspace.invitation');
    expect(newToken).not.toBe(oldToken);
    expect((await user.client.post('/invitations/accept', { token: oldToken })).status).toBe(404);

    await h.prisma.invitation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await user.client.post('/invitations/accept', { token: newToken })).status).toBe(404);
    expect((await h.client().get(`/invitations/lookup?token=${newToken}`)).status).toBe(404);

    await h.prisma.invitation.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() + 86_400_000) },
    });
    expect((await owner.client.delete(`/workspaces/${workspaceId}/invitations/${id}`)).status).toBe(
      204,
    );
    expect((await user.client.post('/invitations/accept', { token: newToken })).status).toBe(404);
    expect((await owner.client.delete(`/workspaces/${workspaceId}/invitations/${id}`)).status).toBe(
      404,
    );
  });

  it("cannot manage another workspace's invitations", async () => {
    const other = await h.verifiedUser('other-owner');
    const otherWs = await h.createWorkspace(other.client, 'Other Invite Co');
    const created = await invite(h.email('scoped'));
    const id = (created.body as { id: string }).id;
    expect((await other.client.delete(`/workspaces/${otherWs}/invitations/${id}`)).status).toBe(
      404,
    );
    expect(
      (await other.client.post(`/workspaces/${otherWs}/invitations/${id}/resend`)).status,
    ).toBe(404);
    expect((await other.client.get(`/workspaces/${workspaceId}/invitations`)).status).toBe(404);
    expect(await h.prisma.invitation.findUniqueOrThrow({ where: { id } })).toMatchObject({
      revokedAt: null,
    });
    await owner.client.delete(`/workspaces/${workspaceId}/invitations/${id}`);
  });
});
