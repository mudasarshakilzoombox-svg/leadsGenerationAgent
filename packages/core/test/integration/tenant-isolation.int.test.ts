// Proves that a user of workspace A cannot read or change workspace B's records, at both layers:
// the tenant-scoped client (application) and composite foreign keys (database).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '../../src/errors/domain-error.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { syncCatalogs } from '../../src/platform/catalog-sync.js';
import { type TenantClient, TenantIsolationError } from '../../src/tenancy/tenant-client.js';
import { WorkspaceAccessService } from '../../src/tenancy/workspace-access.service.js';
import {
  asPrismaService,
  createTenantFixture,
  createTestPrisma,
  destroyTenantFixture,
  expectPrismaError,
  type TenantFixture,
} from './fixtures.js';

/** The subset of a Prisma model delegate these generic checks use. */
interface Delegate {
  findUnique(args: object): Promise<{ id: string } | null>;
  findFirst(args: object): Promise<{ id: string } | null>;
  findMany(args?: object): Promise<{ id: string; updatedAt: Date }[]>;
  count(args?: object): Promise<number>;
  update(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
  updateMany(args: object): Promise<{ count: number }>;
  deleteMany(args: object): Promise<{ count: number }>;
}

const MODELS = [
  ['contact', 'contact'],
  ['company', 'company'],
  ['lead', 'lead'],
  ['campaign', 'campaign'],
  ['campaignRecipient', 'campaignRecipient'],
  ['message', 'message'],
  ['conversation', 'conversation'],
  ['suppression', 'suppression'],
  ['meeting', 'meeting'],
  ['providerConnection', 'providerConnection'],
  ['inboxConnection', 'inboxConnection'],
  ['icp', 'icp'],
] as const satisfies readonly (readonly [string, keyof TenantFixture['ids']])[];

const delegate = (client: TenantClient | PrismaClient, name: string) =>
  (client as unknown as Record<string, Delegate>)[name]!;

let prisma: PrismaClient;
let access: WorkspaceAccessService;
let A: TenantFixture;
let B: TenantFixture;
let dbA: TenantClient;

beforeAll(async () => {
  prisma = createTestPrisma();
  await syncCatalogs(prisma);
  access = new WorkspaceAccessService(asPrismaService(prisma));
  A = await createTenantFixture(prisma, 'iso-a');
  B = await createTenantFixture(prisma, 'iso-b');
  dbA = (await access.forUser(A.ownerId, A.workspaceId)).db;
});

afterAll(async () => {
  await destroyTenantFixture(prisma, A);
  await destroyTenantFixture(prisma, B);
  await prisma?.$disconnect();
});

async function expectNotFound(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe('NOT_FOUND');
  expect((error as DomainError).status).toBe(404);
}

describe('workspace access (TenantGuard backend)', () => {
  it('resolves a member to their own workspace with role permissions', async () => {
    const own = await access.forUser(A.ownerId, A.workspaceId);
    expect(own.roleKey).toBe('OWNER');
    expect(own.can('billing.manage')).toBe(true);
  });

  it('returns 404 for a workspace the user is not a member of', async () => {
    await expectNotFound(access.forUser(A.ownerId, B.workspaceId));
    await expectNotFound(access.forUser(B.ownerId, A.workspaceId));
  });

  it('returns the same 404 for unknown and malformed ids', async () => {
    await expectNotFound(access.forUser(A.ownerId, '0195f000-0000-7000-8000-ffffffffffff'));
    await expectNotFound(access.forUser(A.ownerId, 'not-a-uuid'));
    await expectNotFound(access.forUser('not-a-uuid', A.workspaceId));
  });

  it('returns 404 for soft-deleted and closed workspaces', async () => {
    const C = await createTenantFixture(prisma, 'iso-c');
    try {
      await prisma.workspace.update({ where: { id: C.workspaceId }, data: { status: 'CLOSED' } });
      await expectNotFound(access.forUser(C.ownerId, C.workspaceId));
      await prisma.workspace.update({
        where: { id: C.workspaceId },
        data: { status: 'ACTIVE', deletedAt: new Date() },
      });
      await expectNotFound(access.forUser(C.ownerId, C.workspaceId));
    } finally {
      await destroyTenantFixture(prisma, C);
    }
  });

  it('confines a user who belongs to both workspaces to the one they resolved', async () => {
    const membership = await prisma.workspaceMember.create({
      data: { workspaceId: B.workspaceId, userId: A.ownerId, roleKey: 'MEMBER' },
    });
    try {
      const inB = await access.forUser(A.ownerId, B.workspaceId);
      expect(inB.roleKey).toBe('MEMBER');
      expect(inB.can('billing.manage')).toBe(false);
      const contacts = await inB.db.contact.findMany({ select: { id: true } });
      expect(contacts.map((c) => c.id)).toEqual([B.ids.contact]);
      expect(await inB.db.contact.findUnique({ where: { id: A.ids.contact } })).toBeNull();
    } finally {
      await prisma.workspaceMember.delete({ where: { id: membership.id } });
    }
    // Removing the membership revokes access on the next resolution.
    await expectNotFound(access.forUser(A.ownerId, B.workspaceId));
  });
});

describe.each(MODELS)('tenant client: %s', (model, key) => {
  it("cannot read the other workspace's record", async () => {
    const d = delegate(dbA, model);
    const foreignId = B.ids[key];
    expect(await d.findUnique({ where: { id: foreignId } })).toBeNull();
    expect(await d.findFirst({ where: { id: foreignId } })).toBeNull();
    expect(await d.count({ where: { id: foreignId } })).toBe(0);
    const visible = (await d.findMany()).map((r) => r.id);
    expect(visible).toContain(A.ids[key]);
    expect(visible).not.toContain(foreignId);
  });

  it("cannot update or delete the other workspace's record", async () => {
    const d = delegate(dbA, model);
    const foreignId = B.ids[key];
    const before = await delegate(prisma, model).findUnique({ where: { id: foreignId } });

    await expectPrismaError(
      d.update({ where: { id: foreignId }, data: { updatedAt: new Date() } }),
      'P2025',
    );
    await expectPrismaError(d.delete({ where: { id: foreignId } }), 'P2025');
    expect(
      (await d.updateMany({ where: { id: foreignId }, data: { updatedAt: new Date() } })).count,
    ).toBe(0);
    expect((await d.deleteMany({ where: { id: foreignId } })).count).toBe(0);

    expect(await delegate(prisma, model).findUnique({ where: { id: foreignId } })).toEqual(before);
  });
});

describe('tenant client: writes', () => {
  it('rejects writes that name another workspace', async () => {
    await expect(
      dbA.suppression.create({
        data: { workspaceId: B.workspaceId, domain: 'x.example', reason: 'MANUAL' },
      }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(
      dbA.contact.updateMany({ where: {}, data: { workspaceId: B.workspaceId } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(
      dbA.contact.findMany({ where: { workspaceId: B.workspaceId } }),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it('accepts creates that name its own workspace', async () => {
    const created = await dbA.suppression.create({
      data: { workspaceId: A.workspaceId, domain: 'own.example', reason: 'MANUAL' },
    });
    expect(created.workspaceId).toBe(A.workspaceId);
    await dbA.suppression.delete({ where: { id: created.id } });
  });

  it('blocks models that are not workspace-scoped', async () => {
    await expect(dbA.user.findMany()).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(dbA.workspace.findMany()).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(dbA.webhookEvent.findMany()).rejects.toBeInstanceOf(TenantIsolationError);
    await expect(dbA.plan.findMany()).resolves.toBeInstanceOf(Array);
  });
});

describe('database: composite foreign keys', () => {
  it("rejects links from workspace A to workspace B's records", async () => {
    // Each of these passes the tenant client (it names workspace A), and the database refuses it.
    await expectPrismaError(
      dbA.contact.create({
        data: {
          workspaceId: A.workspaceId,
          companyId: B.ids.company,
          lawfulBasis: 'LEGITIMATE_INTEREST',
          source: 'MANUAL',
        },
      }),
      'P2003',
    );
    await expectPrismaError(
      dbA.lead.create({
        data: { workspaceId: A.workspaceId, contactId: A.ids.contact, icpId: B.ids.icp },
      }),
      'P2003',
    );
    // A fresh contact, so only the foreign lead (not the one-live-enrollment rule) is at fault.
    const fresh = await dbA.contact.create({
      data: { workspaceId: A.workspaceId, lawfulBasis: 'LEGITIMATE_INTEREST', source: 'MANUAL' },
    });
    await expectPrismaError(
      dbA.campaignRecipient.create({
        data: {
          workspaceId: A.workspaceId,
          campaignId: A.ids.campaign,
          leadId: B.ids.lead,
          contactId: fresh.id,
        },
      }),
      'P2003',
    );
    await dbA.contact.delete({ where: { id: fresh.id } });
    await expectPrismaError(
      dbA.campaign.update({ where: { id: A.ids.campaign }, data: { icpId: B.ids.icp } }),
      'P2003',
    );
    await expectPrismaError(
      dbA.campaignMailbox.create({
        data: {
          workspaceId: A.workspaceId,
          campaignId: A.ids.campaign,
          inboxConnectionId: B.ids.inboxConnection,
        },
      }),
      'P2003',
    );
  });

  it('rejects cross-workspace links written with raw SQL', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO contacts (id, workspace_id, company_id, lawful_basis, source, updated_at)
        VALUES (gen_random_uuid(), ${A.workspaceId}::uuid, ${B.ids.company}::uuid,
                'LEGITIMATE_INTEREST'::lawful_basis, 'MANUAL'::record_source, now())`,
    ).rejects.toThrow(/foreign key/i);
  });

  it('rejects moving a row into another workspace', async () => {
    // The contact's company stays in A, so (workspace_id = B, company_id) no longer resolves.
    await expectPrismaError(
      prisma.contact.update({ where: { id: A.ids.contact }, data: { workspaceId: B.workspaceId } }),
      'P2003',
    );
  });
});
