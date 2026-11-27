import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '../../src/errors/domain-error.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { PLAN_KEYS } from '../../src/platform/billing/plans.js';
import { syncCatalogs } from '../../src/platform/catalog-sync.js';
import { ROLE_KEYS } from '../../src/platform/tenancy/permissions.js';
import { WorkspaceAccessService } from '../../src/tenancy/workspace-access.service.js';
import { SEED, seedDevData } from '../../src/seed/dev-seed.js';
import { asPrismaService, createTestPrisma } from './fixtures.js';

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = createTestPrisma();
  await syncCatalogs(prisma);
  await seedDevData(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('development seed', () => {
  it('syncs every plan and role from the code catalogs', async () => {
    expect(
      (await prisma.plan.findMany({ select: { key: true } })).map((p) => p.key).sort(),
    ).toEqual([...PLAN_KEYS].sort());
    expect(
      (await prisma.role.findMany({ select: { key: true } })).map((r) => r.key).sort(),
    ).toEqual([...ROLE_KEYS].sort());
  });

  it('is idempotent', async () => {
    const counts = async () =>
      Promise.all([
        prisma.user.count(),
        prisma.contact.count(),
        prisma.message.count(),
        prisma.auditLog.count(),
      ]);
    const before = await counts();
    const again = await seedDevData(prisma);
    expect(again.inserted).toBe(0);
    expect(await counts()).toEqual(before);
    await syncCatalogs(prisma);
  });

  it("keeps each seeded workspace's data separate, even for a user in both", async () => {
    const access = new WorkspaceAccessService(asPrismaService(prisma));
    const acme = await access.forUser(SEED.users.mia, SEED.workspaces.acme);
    const northwind = await access.forUser(SEED.users.mia, SEED.workspaces.northwind);
    expect(acme.roleKey).toBe('MEMBER');
    expect(northwind.roleKey).toBe('ADMIN');
    // Northwind turned launch approval off, so its Members could launch; Mia is an Admin there anyway.
    expect(acme.can('campaigns.launch')).toBe(false);

    const acmeContacts = await acme.db.contact.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    expect(acmeContacts.map((c) => c.id).sort()).toEqual(
      [SEED.contacts.jane, SEED.contacts.john, SEED.contacts.ana].sort(),
    );
    const northwindContacts = await northwind.db.contact.findMany({ select: { id: true } });
    expect(northwindContacts.map((c) => c.id).sort()).toEqual(
      [SEED.contacts.sam, SEED.contacts.janeNorthwind].sort(),
    );

    // The same email exists in both workspaces as two separate contacts.
    expect(await northwind.db.contact.findUnique({ where: { id: SEED.contacts.jane } })).toBeNull();

    await expect(access.forUser(SEED.users.noah, SEED.workspaces.acme)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(
      access.forUser(SEED.users.superAdmin, SEED.workspaces.acme),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
