/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- supertest bodies are untyped JSON; each assertion checks their shape. */
// PRD WS-06 (workspace settings with optimistic locking, 03-api §7) and WS-07 (delete with a
// 30-day restore window, ADR-0038): role matrix, cross-tenant 404s, restricted writes, audit.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { httpClient } from '../../test-app.js';
import { Harness, STRONG_PASSWORD, type TestUser } from './harness.js';

let h: Harness;
let owner: TestUser;
let workspaceId: string;
let admin: TestUser & { memberId: string };
let member: TestUser & { memberId: string };
let reader: TestUser & { memberId: string };
let outsider: TestUser;

const NAME = 'Lifecycle Test Co';
const ws = (path = '') => `/workspaces/${workspaceId}${path}`;
const ADDRESS = {
  line1: '1 Example Street',
  city: 'London',
  postalCode: 'EC1A 1AA',
  country: 'gb',
};

beforeAll(async () => {
  h = await Harness.create();
  owner = await h.verifiedUser('lc-owner');
  workspaceId = await h.createWorkspace(owner.client, NAME);
  await h.allowSeats(workspaceId, 10);
  admin = await h.addMember(owner.client, workspaceId, 'ADMIN', 'lc-admin');
  member = await h.addMember(owner.client, workspaceId, 'MEMBER', 'lc-member');
  reader = await h.addMember(owner.client, workspaceId, 'READ_ONLY', 'lc-reader');
  outsider = await h.verifiedUser('lc-outsider');
  await h.createWorkspace(outsider.client, 'Outsider Co');
});
afterAll(async () => h?.close());

async function etag(): Promise<string> {
  const res = await owner.client.get(ws());
  expect(res.status).toBe(200);
  return res.headers.etag as string;
}

describe('workspace settings (WS-06)', () => {
  it('returns the detail with a weak ETag and launch readiness', async () => {
    const res = await owner.client.get(ws());
    expect(res.status).toBe(200);
    expect(res.headers.etag).toBe(`W/"${res.body.rowVersion}"`);
    expect(res.body).toMatchObject({
      name: NAME,
      status: 'TRIALING',
      launchRequiresApproval: true, // WS-06 AC2: ON by default
      defaultSendWindow: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
      launchReadiness: { ready: false, missing: ['physicalAddress', 'privacyNoticeUrl'] },
      roleKey: 'OWNER',
    });
  });

  it('requires If-Match (428) and rejects a stale one (412)', async () => {
    const missing = await owner.client.patch(ws(), { legalName: 'Acme Ltd' });
    expect(missing.status).toBe(428);
    expect(missing.body.code).toBe('PRECONDITION_REQUIRED');

    const stale = await owner.client.patch(
      ws(),
      { legalName: 'Acme Ltd' },
      { 'If-Match': 'W/"999"' },
    );
    expect(stale.status).toBe(412);
    expect(stale.body.code).toBe('PRECONDITION_FAILED');
  });

  it('saves every field, bumps the version and reports launch readiness (AC1)', async () => {
    const before = await etag();
    const res = await owner.client.patch(
      ws(),
      {
        legalName: 'Lifecycle Test Co Ltd',
        physicalAddress: ADDRESS,
        privacyNoticeUrl: 'https://lifecycle.example/privacy',
        defaultTimezone: 'Europe/London',
        defaultSendWindow: { days: [5, 1, 3], start: '08:30', end: '16:00' },
      },
      { 'If-Match': before },
    );
    expect(res.status).toBe(200);
    expect(res.headers.etag).not.toBe(before);
    expect(res.body).toMatchObject({
      legalName: 'Lifecycle Test Co Ltd',
      physicalAddress: { ...ADDRESS, country: 'GB' },
      defaultTimezone: 'Europe/London',
      defaultSendWindow: { days: [1, 3, 5], start: '08:30', end: '16:00' },
      launchReadiness: { ready: true, missing: [] },
    });

    // The old ETag is now stale: a second editor cannot overwrite silently.
    const conflict = await admin.client.patch(ws(), { legalName: 'Other' }, { 'If-Match': before });
    expect(conflict.status).toBe(412);

    // null clears; the audit trail records field names only.
    const cleared = await owner.client.patch(
      ws(),
      { legalName: null },
      { 'If-Match': await etag() },
    );
    expect(cleared.body.legalName).toBeNull();
    const audit = await h.prisma.auditLog.findFirst({
      where: { workspaceId, action: 'workspace.settings_updated' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit?.metadata).toEqual({
      fields: 'defaultSendWindow,defaultTimezone,legalName,physicalAddress,privacyNoticeUrl',
    });
    expect(JSON.stringify(audit)).not.toContain('Example Street');
  });

  it('validates input with field pointers and refuses mass assignment', async () => {
    const tag = await etag();
    const bad = await owner.client.patch(
      ws(),
      { physicalAddress: { ...ADDRESS, country: 'GBR' }, privacyNoticeUrl: 'http://x.example' },
      { 'If-Match': tag },
    );
    expect(bad.status).toBe(400);
    const pointers = (bad.body.errors as { pointer: string }[]).map((e) => e.pointer);
    expect(pointers).toEqual(
      expect.arrayContaining(['/physicalAddress/country', '/privacyNoticeUrl']),
    );
    for (const body of [{ status: 'ACTIVE' }, { planKey: 'agency' }, { workspaceId }, {}]) {
      expect((await owner.client.patch(ws(), body, { 'If-Match': tag })).status).toBe(400);
    }
  });

  it('lets Owners and Admins edit, not Members or Read-only (permission matrix)', async () => {
    expect(
      (await admin.client.patch(ws(), { legalName: 'By Admin' }, { 'If-Match': await etag() }))
        .status,
    ).toBe(200);
    for (const user of [member, reader]) {
      const res = await user.client.patch(
        ws(),
        { legalName: 'Nope' },
        { 'If-Match': await etag() },
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
      expect((await user.client.get(ws())).status).toBe(200); // everyone can read
    }
  });

  it('turning launch approval off lets Members launch (AC2, SECURITY §3.2 footnote 3)', async () => {
    const perms = async () => (await member.client.get(ws())).body.permissions as string[];
    expect(await perms()).not.toContain('campaigns.launch');
    const off = await owner.client.patch(
      ws(),
      { launchRequiresApproval: false },
      { 'If-Match': await etag() },
    );
    expect(off.body.launchRequiresApproval).toBe(false);
    expect(await perms()).toContain('campaigns.launch');
    await owner.client.patch(ws(), { launchRequiresApproval: true }, { 'If-Match': await etag() });
    expect(await perms()).not.toContain('campaigns.launch');
  });

  it('answers 404 to non-members on every route (cross-tenant)', async () => {
    const c = outsider.client;
    expect((await c.get(ws())).status).toBe(404);
    expect((await c.patch(ws(), { legalName: 'x' }, { 'If-Match': 'W/"1"' })).status).toBe(404);
    expect((await c.delete(ws(), { confirmName: NAME })).status).toBe(404);
    expect((await c.post(ws('/restore'))).status).toBe(404);
    expect((await c.get('/workspaces/00000000-0000-7000-8000-000000000000')).status).toBe(404);
  });
});

describe('delete and restore (WS-07)', () => {
  it('only the Owner can delete, after recent authentication and the exact name (AC1)', async () => {
    for (const user of [admin, member, reader]) {
      const res = await user.client.delete(ws(), { confirmName: NAME });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    }

    await h.prisma.session.updateMany({
      where: { userId: owner.id },
      data: { reauthenticatedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await h.flushSessionCache();
    const stale = await owner.client.delete(ws(), { confirmName: NAME });
    expect(stale.status).toBe(403);
    expect(stale.body.code).toBe('REAUTH_REQUIRED');
    expect(
      (await owner.client.post('/auth/reauthenticate', { password: STRONG_PASSWORD })).status,
    ).toBe(204);

    const wrong = await owner.client.delete(ws(), { confirmName: 'lifecycle test co' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.errors[0]).toMatchObject({ pointer: '/confirmName' });
    expect((await owner.client.delete(ws(), {})).status).toBe(400);
  });

  it('schedules deletion: sending and writes stop, reads continue, Owner can restore (AC2)', async () => {
    const res = await owner.client.delete(ws(), { confirmName: NAME });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING_DELETION');
    const purgeAfter = new Date(res.body.purgeAfter as string).getTime();
    expect(purgeAfter).toBeGreaterThan(Date.now() + 29.9 * 86_400_000);
    expect(purgeAfter).toBeLessThan(Date.now() + 30.1 * 86_400_000);

    // Every member sees it (banner), reads work, writes are restricted.
    const me = await member.client.get('/auth/me');
    const membership = (
      me.body.memberships as { workspace: { id: string; status: string; purgeAfter: string } }[]
    ).find((m) => m.workspace.id === workspaceId);
    expect(membership?.workspace).toMatchObject({
      status: 'PENDING_DELETION',
      purgeAfter: res.body.purgeAfter,
    });
    expect((await member.client.get(ws())).status).toBe(200);
    const write = await admin.client.patch(ws(), { legalName: 'x' }, { 'If-Match': await etag() });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe('WORKSPACE_RESTRICTED');
    const invite = await owner.client.post(
      ws('/invitations'),
      { email: h.email('late-invite'), roleKey: 'MEMBER' },
      { 'Idempotency-Key': 'lifecycle-late-invite' },
    );
    expect(invite.body.code).toBe('WORKSPACE_RESTRICTED');

    // Deleting twice is an illegal transition; only the Owner restores.
    expect((await owner.client.delete(ws(), { confirmName: NAME })).body.code).toBe(
      'ILLEGAL_STATE_TRANSITION',
    );
    expect((await admin.client.post(ws('/restore'))).status).toBe(403);

    const restored = await owner.client.post(ws('/restore'));
    expect(restored.status).toBe(200);
    // The trial comes back as a trial (status before deletion), not as ACTIVE.
    expect(restored.body).toMatchObject({
      status: 'TRIALING',
      purgeAfter: null,
      deletionRequestedAt: null,
    });
    expect(
      (await admin.client.patch(ws(), { legalName: 'Back' }, { 'If-Match': await etag() })).status,
    ).toBe(200);
    expect((await owner.client.post(ws('/restore'))).body.code).toBe('ILLEGAL_STATE_TRANSITION');

    const actions = await h.prisma.auditLog.findMany({
      where: {
        workspaceId,
        action: { in: ['workspace.deletion_requested', 'workspace.restored'] },
      },
      select: { action: true, metadata: true, actorUserId: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions).toEqual([
      {
        action: 'workspace.deletion_requested',
        metadata: { previousStatus: 'TRIALING', graceDays: 30 },
        actorUserId: owner.id,
      },
      {
        action: 'workspace.restored',
        metadata: { restoredStatus: 'TRIALING' },
        actorUserId: owner.id,
      },
    ]);
  });

  it('cannot restore once the 30-day window has ended', async () => {
    const other = await h.createWorkspace(owner.client, 'Expired Co');
    await owner.client.post('/auth/reauthenticate', { password: STRONG_PASSWORD });
    expect(
      (await owner.client.delete(`/workspaces/${other}`, { confirmName: 'Expired Co' })).status,
    ).toBe(200);
    await h.prisma.workspace.update({
      where: { id: other },
      data: { purgeAfter: new Date(Date.now() - 1000) },
    });
    const res = await owner.client.post(`/workspaces/${other}/restore`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
  });
});

describe('Bull Board (/admin/queues, 06-background-jobs §12)', () => {
  const ALLOWED_IP = '203.0.113.7';
  let hb: Harness;
  let admin: TestUser;
  let normal: TestUser;

  beforeAll(async () => {
    hb = await Harness.create({ ADMIN_IP_ALLOWLIST: `${ALLOWED_IP}, 127.0.0.1` });
    admin = await hb.verifiedUser('platform-admin');
    normal = await hb.verifiedUser('not-admin');
    await hb.prisma.user.update({ where: { id: admin.id }, data: { platformRole: 'SUPER_ADMIN' } });
    await hb.flushSessionCache();
  });
  afterAll(async () => hb?.close());

  const open = (user: TestUser | null, ip: string, path = '/admin/queues') => {
    let req = httpClient(hb.app).get(path).set('X-Forwarded-For', ip);
    if (user?.client.cookie) req = req.set('Cookie', `__Host-lga_session=${user.client.cookie}`);
    return req;
  };

  it('is a plain 404 for everyone who is not an allowlisted Super Admin', async () => {
    for (const [user, ip] of [
      [null, ALLOWED_IP],
      [normal, ALLOWED_IP],
      [admin, '198.51.100.9'],
    ] as const) {
      const res = await open(user, ip);
      expect(res.status).toBe(404);
      expect(res.text).toBe('Not Found');
    }
  });

  it('serves the dashboard and its queue API to an allowlisted Super Admin', async () => {
    const page = await open(admin, ALLOWED_IP);
    expect(page.status).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    const api = await open(admin, ALLOWED_IP, '/admin/queues/api/queues');
    expect(api.status).toBe(200);
    const names = (api.body.queues as { name: string }[]).map((q) => q.name);
    expect(names).toEqual(expect.arrayContaining(['maintenance', 'notifications', 'ai', 'system']));
  });

  it('refuses state-changing requests that are not same-origin (CSRF)', async () => {
    const res = await httpClient(hb.app)
      .put('/admin/queues/api/queues/maintenance/pause')
      .set('X-Forwarded-For', ALLOWED_IP)
      .set('Cookie', `__Host-lga_session=${admin.client.cookie}`);
    expect(res.status).toBe(403);
  });
});
