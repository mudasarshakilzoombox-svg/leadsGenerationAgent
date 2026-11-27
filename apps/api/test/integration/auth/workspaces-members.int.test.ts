// PRD WS-01 (create), WS-04 (manage members), WS-05 (transfer), RBAC matrix incl. READ_ONLY,
// cross-tenant isolation and workspace status restrictions.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, Harness, type TestUser } from './harness.js';

let h: Harness;
let owner: TestUser;
let workspaceId: string;
let admin: TestUser & { memberId: string };
let member: TestUser & { memberId: string };
let reader: TestUser & { memberId: string };
let outsider: TestUser;
let outsiderWorkspaceId: string;

beforeAll(async () => {
  h = await Harness.create();
  owner = await h.verifiedUser('owner');
  workspaceId = await h.createWorkspace(owner.client, 'Acme Test Co');
  await h.allowSeats(workspaceId, 10);
  admin = await h.addMember(owner.client, workspaceId, 'ADMIN');
  member = await h.addMember(owner.client, workspaceId, 'MEMBER');
  reader = await h.addMember(owner.client, workspaceId, 'READ_ONLY');
  outsider = await h.verifiedUser('outsider');
  outsiderWorkspaceId = await h.createWorkspace(outsider.client, 'Other Co');
});
afterAll(async () => h?.close());

const ws = (path = '') => `/workspaces/${workspaceId}${path}`;

describe('workspace creation (WS-01)', () => {
  it('creates a trial workspace with the creator as Owner and a unique slug', async () => {
    const user = await h.verifiedUser('creator');
    const res = await user.client.post('/workspaces', {
      name: 'Acme Test Co',
      timezone: 'Europe/London',
    });
    expect(res.status).toBe(201);
    const body = res.body as {
      id: string;
      slug: string;
      status: string;
      planKey: string;
      trialEndsAt: string;
      defaultTimezone: string;
    };
    h.trackWorkspace(body.id);
    expect(res.headers.location).toBe(`/api/v1/workspaces/${body.id}`);
    expect(body).toMatchObject({
      status: 'TRIALING',
      planKey: 'trial',
      defaultTimezone: 'Europe/London',
    });
    expect(body.slug).toMatch(/^acme-test-co-[0-9a-f]{6}$/); // "acme-test-co" was taken above
    expect(new Date(body.trialEndsAt).getTime()).toBeGreaterThan(Date.now() + 13.9 * 86_400_000);

    const me = await user.client.get('/auth/me');
    const membership = (
      me.body as {
        memberships: { workspace: { id: string }; roleKey: string; permissions: string[] }[];
      }
    ).memberships[0]!;
    expect(membership).toMatchObject({ workspace: { id: body.id }, roleKey: 'OWNER' });
    expect(membership.permissions).toContain('billing.manage');
    expect(
      await h.prisma.auditLog.count({
        where: { workspaceId: body.id, action: 'workspace.created' },
      }),
    ).toBe(1);
  });

  it.each([
    ['a role', { role: 'OWNER' }],
    ['an owner id', { ownerUserId: '0195f000-0000-7000-8000-000000000001' }],
    ['a workspace id', { id: '0195f000-0000-7000-8000-000000000001' }],
    ['a status', { status: 'ACTIVE' }],
    ['a plan', { planKey: 'agency' }],
  ])('ignores nothing: a body with %s is rejected', async (_label, extra) => {
    const res = await owner.client.post('/workspaces', { name: 'Sneaky', ...extra });
    expect(res.status).toBe(400);
  });

  it('requires a session', async () => {
    expect((await h.client().post('/workspaces', { name: 'Anon' })).status).toBe(401);
  });

  it("lists the caller's workspaces with role and permissions per workspace", async () => {
    const res = await reader.client.get('/workspaces');
    expect(res.status).toBe(200);
    const data = (
      res.body as { data: { workspace: { id: string }; roleKey: string; permissions: string[] }[] }
    ).data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      workspace: { id: workspaceId },
      roleKey: 'READ_ONLY',
      permissions: ['analytics.view'],
    });
  });
});

describe('RBAC matrix (SECURITY.md §3.2 + READ_ONLY)', () => {
  type Case = [label: string, call: (c: Client) => Promise<{ status: number }>, allowed: string[]];
  const roles = () => ({ OWNER: owner, ADMIN: admin, MEMBER: member, READ_ONLY: reader });
  const cases: Case[] = [
    ['view the workspace', (c) => c.get(ws()), ['OWNER', 'ADMIN', 'MEMBER', 'READ_ONLY']],
    ['list members', (c) => c.get(ws('/members')), ['OWNER', 'ADMIN', 'MEMBER', 'READ_ONLY']],
    ['list invitations', (c) => c.get(ws('/invitations')), ['OWNER', 'ADMIN']],
    [
      'change a role',
      (c) => c.patch(ws(`/members/${member.memberId}`), { roleKey: 'MEMBER' }),
      ['OWNER', 'ADMIN'],
    ],
    [
      'invite someone',
      (c) =>
        c.post(
          ws('/invitations'),
          { email: h.email('matrix'), roleKey: 'MEMBER' },
          { 'Idempotency-Key': `matrix-${Math.random().toString(36).slice(2)}` },
        ),
      ['OWNER', 'ADMIN'],
    ],
  ];

  it.each(
    cases.flatMap(([label, call, allowed]) =>
      (['OWNER', 'ADMIN', 'MEMBER', 'READ_ONLY'] as const).map(
        (role) => [label, role, call, allowed.includes(role)] as const,
      ),
    ),
  )('%s as %s', async (_label, role, call, allowed) => {
    const res = await call(roles()[role].client);
    if (allowed) {
      expect(res.status).toBeLessThan(300);
    } else {
      expect(res.status).toBe(403);
      expect((res as unknown as { body: { code: string } }).body.code).toBe('PERMISSION_DENIED');
    }
  });

  // The Owner's own transfer is covered (with its side effects) in the WS-05 suite below.
  it.each(['ADMIN', 'MEMBER', 'READ_ONLY'] as const)(
    'transfer ownership as %s is denied',
    async (role) => {
      const res = await roles()[role].client.post(ws('/transfer-ownership'), {
        memberId: admin.memberId,
      });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'PERMISSION_DENIED' });
    },
  );

  it('never lets READ_ONLY or MEMBER remove someone else', async () => {
    for (const actor of [reader, member]) {
      const res = await actor.client.delete(ws(`/members/${admin.memberId}`));
      expect(res.status).toBe(403);
    }
    expect(await h.prisma.workspaceMember.count({ where: { id: admin.memberId } })).toBe(1);
  });
});

describe('member management (WS-04)', () => {
  it('protects the Owner from role changes and removal, and cannot assign OWNER', async () => {
    const ownerMember = await h.prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId, roleKey: 'OWNER' },
    });
    expect(
      (await admin.client.patch(ws(`/members/${ownerMember.id}`), { roleKey: 'MEMBER' })).status,
    ).toBe(403);
    expect((await admin.client.delete(ws(`/members/${ownerMember.id}`))).status).toBe(403);
    expect((await owner.client.delete(ws(`/members/${ownerMember.id}`))).status).toBe(403); // owner cannot leave
    expect(
      (await owner.client.patch(ws(`/members/${member.memberId}`), { roleKey: 'OWNER' })).status,
    ).toBe(400);
  });

  it('changes roles with immediate effect and audits them', async () => {
    const res = await admin.client.patch(ws(`/members/${reader.memberId}`), { roleKey: 'MEMBER' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ roleKey: 'MEMBER' });
    // The reader's very next request runs with the new role.
    const listInvites = await reader.client.get(ws('/invitations'));
    expect(listInvites.status).toBe(403);
    const me = await reader.client.get(ws());
    expect(me.body).toMatchObject({ roleKey: 'MEMBER' });
    expect(
      await h.prisma.auditLog.count({
        where: { workspaceId, action: 'member.role_changed', targetId: reader.memberId },
      }),
    ).toBeGreaterThan(0);
    await admin.client.patch(ws(`/members/${reader.memberId}`), { roleKey: 'READ_ONLY' });
  });

  it('removes a member: access ends on the next request, their mailboxes pause and move to the Owner', async () => {
    const leaving = await h.addMember(owner.client, workspaceId, 'MEMBER', 'removed');
    const inbox = await h.prisma.inboxConnection.create({
      data: {
        workspaceId,
        ownerUserId: leaving.id,
        provider: 'SMTP_IMAP',
        emailAddress: `${leaving.id}@mail.test`,
        emailNormalized: `${leaving.id}@mail.test`,
      },
    });
    expect((await leaving.client.get(ws())).status).toBe(200); // session cached
    expect((await admin.client.delete(ws(`/members/${leaving.memberId}`))).status).toBe(204);

    expect((await leaving.client.get(ws())).status).toBe(404);
    expect((await leaving.client.get(ws('/members'))).status).toBe(404);
    // Their account and session still work for everything else.
    expect((await leaving.client.get('/auth/me')).status).toBe(200);
    const moved = await h.prisma.inboxConnection.findUniqueOrThrow({ where: { id: inbox.id } });
    expect(moved).toMatchObject({
      ownerUserId: owner.id,
      status: 'PAUSED',
      statusReason: 'owner_removed',
    });
    expect(
      await h.prisma.auditLog.count({
        where: { workspaceId, action: 'member.removed', targetId: leaving.memberId },
      }),
    ).toBe(1);
  });

  it('lets any non-Owner leave on their own', async () => {
    const leaver = await h.addMember(owner.client, workspaceId, 'READ_ONLY', 'leaver');
    expect((await leaver.client.delete(ws(`/members/${leaver.memberId}`))).status).toBe(204);
    expect((await leaver.client.get(ws())).status).toBe(404);
    expect(
      await h.prisma.auditLog.count({
        where: { workspaceId, action: 'member.left', targetId: leaver.memberId },
      }),
    ).toBe(1);
  });
});

describe('ownership transfer (WS-05)', () => {
  it('requires recent re-authentication, an Admin target, and swaps roles atomically', async () => {
    await h.prisma.session.updateMany({
      where: { userId: owner.id },
      data: { reauthenticatedAt: new Date(Date.now() - 3600_000) },
    });
    await h.flushSessionCache();
    const stale = await owner.client.post(ws('/transfer-ownership'), { memberId: admin.memberId });
    expect(stale.status).toBe(403);
    expect(stale.body).toMatchObject({ code: 'REAUTH_REQUIRED' });

    expect(
      (await owner.client.post('/auth/reauthenticate', { password: owner.password })).status,
    ).toBe(204);
    const toMember = await owner.client.post(ws('/transfer-ownership'), {
      memberId: member.memberId,
    });
    expect(toMember.status).toBe(422);

    expect(
      (await owner.client.post(ws('/transfer-ownership'), { memberId: admin.memberId })).status,
    ).toBe(204);
    const roles = await h.prisma.workspaceMember.findMany({
      where: { workspaceId, userId: { in: [owner.id, admin.id] } },
    });
    expect(Object.fromEntries(roles.map((r) => [r.userId, r.roleKey]))).toEqual({
      [owner.id]: 'ADMIN',
      [admin.id]: 'OWNER',
    });
    expect(await h.prisma.workspaceMember.count({ where: { workspaceId, roleKey: 'OWNER' } })).toBe(
      1,
    );

    // The former Owner lost Owner-only powers on the next request.
    const again = await owner.client.post(ws('/transfer-ownership'), { memberId: admin.memberId });
    expect(again.status).toBe(403);
    expect(
      await h.prisma.auditLog.count({
        where: { workspaceId, action: 'workspace.ownership_transferred' },
      }),
    ).toBe(1);

    // Transfer back so the rest of the suite keeps its fixture roles.
    const formerOwnerMember = await h.prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId, userId: owner.id },
    });
    expect(
      (await admin.client.post(ws('/transfer-ownership'), { memberId: formerOwnerMember.id }))
        .status,
    ).toBe(204);
  });
});

describe('workspace isolation', () => {
  const outsiderCalls: [string, (c: Client) => Promise<{ status: number }>][] = [
    ['GET workspace', (c) => c.get(ws())],
    ['GET members', (c) => c.get(ws('/members'))],
    ['PATCH member', (c) => c.patch(ws(`/members/${member.memberId}`), { roleKey: 'ADMIN' })],
    ['DELETE member', (c) => c.delete(ws(`/members/${member.memberId}`))],
    ['POST transfer', (c) => c.post(ws('/transfer-ownership'), { memberId: admin.memberId })],
    ['GET invitations', (c) => c.get(ws('/invitations'))],
    [
      'POST invitation',
      (c) =>
        c.post(
          ws('/invitations'),
          { email: h.email('x'), roleKey: 'ADMIN' },
          { 'Idempotency-Key': 'outsider-key-1' },
        ),
    ],
  ];

  it.each(outsiderCalls)('a non-member gets 404 for %s', async (_label, call) => {
    const res = await call(outsider.client);
    expect(res.status).toBe(404);
    expect((res as unknown as { body: { code: string } }).body.code).toBe('NOT_FOUND');
  });

  it("cannot reach this workspace's members through the outsider's own workspace", async () => {
    const res = await outsider.client.patch(
      `/workspaces/${outsiderWorkspaceId}/members/${member.memberId}`,
      { roleKey: 'ADMIN' },
    );
    expect(res.status).toBe(404);
    const removed = await outsider.client.delete(
      `/workspaces/${outsiderWorkspaceId}/members/${member.memberId}`,
    );
    expect(removed.status).toBe(404);
    expect(
      await h.prisma.workspaceMember.findUniqueOrThrow({ where: { id: member.memberId } }),
    ).toMatchObject({ roleKey: 'MEMBER' });
  });

  it('returns 404 for malformed and unknown workspace ids', async () => {
    expect((await owner.client.get('/workspaces/not-a-uuid')).status).toBe(404);
    expect(
      (await owner.client.get('/workspaces/0195f000-0000-7000-8000-ffffffffffff')).status,
    ).toBe(404);
  });

  it('blocks writes, but not reads, while the workspace is READ_ONLY', async () => {
    await h.prisma.workspace.update({ where: { id: workspaceId }, data: { status: 'READ_ONLY' } });
    try {
      expect((await owner.client.get(ws('/members'))).status).toBe(200);
      const write = await owner.client.patch(ws(`/members/${member.memberId}`), {
        roleKey: 'ADMIN',
      });
      expect(write.status).toBe(403);
      expect(write.body).toMatchObject({ code: 'WORKSPACE_RESTRICTED' });
    } finally {
      await h.prisma.workspace.update({ where: { id: workspaceId }, data: { status: 'TRIALING' } });
    }
  });
});
