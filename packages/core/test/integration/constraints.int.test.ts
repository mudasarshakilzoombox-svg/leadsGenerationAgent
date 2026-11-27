// Integrity rules enforced by the database itself (uniques, partial uniques, CHECKs, delete
// policies, append-only grants), independent of application code.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { syncCatalogs } from '../../src/platform/catalog-sync.js';
import {
  createTenantFixture,
  createTestPrisma,
  createUser,
  destroyTenantFixture,
  expectPrismaError,
  type TenantFixture,
} from './fixtures.js';

let prisma: PrismaClient;
let A: TenantFixture;

beforeAll(async () => {
  prisma = createTestPrisma();
  await syncCatalogs(prisma);
  A = await createTenantFixture(prisma, 'con-a');
});

afterAll(async () => {
  await destroyTenantFixture(prisma, A);
  await prisma?.$disconnect();
});

async function rejectsWith(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toThrow(pattern);
}

describe('uniqueness', () => {
  it('allows exactly one Owner per workspace', async () => {
    const other = await createUser(prisma, 'second-owner');
    try {
      await expectPrismaError(
        prisma.workspaceMember.create({
          data: { workspaceId: A.workspaceId, userId: other.id, roleKey: 'OWNER' },
        }),
        'P2002',
      );
      // An Admin is fine.
      await prisma.workspaceMember.create({
        data: { workspaceId: A.workspaceId, userId: other.id, roleKey: 'ADMIN' },
      });
    } finally {
      await prisma.user.delete({ where: { id: other.id } });
    }
  });

  it('rejects a duplicate contact email until the first is soft-deleted', async () => {
    const email = 'duplicate@unique-check.example';
    const data = {
      workspaceId: A.workspaceId,
      email,
      emailNormalized: email,
      lawfulBasis: 'LEGITIMATE_INTEREST',
      source: 'MANUAL',
    } as const;
    const first = await prisma.contact.create({ data });
    await expectPrismaError(prisma.contact.create({ data }), 'P2002');
    await prisma.contact.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    const second = await prisma.contact.create({ data });
    expect(second.id).not.toBe(first.id);
  });

  it('records at most one non-failed outbound message per recipient and step (exactly-once)', async () => {
    const base = {
      workspaceId: A.workspaceId,
      conversationId: A.ids.conversation,
      inboxConnectionId: A.ids.inboxConnection,
      recipientId: A.ids.campaignRecipient,
      stepId: A.ids.campaignStep,
      direction: 'OUTBOUND',
      fromEmail: 'sender@fixture.test',
    } as const;
    // The fixture already has a SENT message for this recipient and step.
    await expectPrismaError(
      prisma.message.create({
        data: { ...base, status: 'SENDING', rfcMessageId: '<dup-1@fixture.test>' },
      }),
      'P2002',
    );
    // A FAILED attempt does not count, and inbound replies are not constrained.
    await prisma.message.create({
      data: { ...base, status: 'FAILED', rfcMessageId: '<failed-1@fixture.test>' },
    });
    await prisma.message.create({
      data: {
        ...base,
        direction: 'INBOUND',
        status: 'RECEIVED',
        rfcMessageId: '<reply-1@fixture.test>',
      },
    });
  });

  it('keeps a contact in at most one live sequence', async () => {
    const second = await prisma.campaign.create({
      data: {
        workspaceId: A.workspaceId,
        businessProfileId: A.ids.businessProfile,
        icpId: A.ids.icp,
        name: 'Second',
      },
    });
    const enrol = () =>
      prisma.campaignRecipient.create({
        data: {
          workspaceId: A.workspaceId,
          campaignId: second.id,
          leadId: A.ids.lead,
          contactId: A.ids.contact,
        },
      });
    await expectPrismaError(enrol(), 'P2002');
    await prisma.campaignRecipient.update({
      where: { id: A.ids.campaignRecipient },
      data: { status: 'COMPLETED' },
    });
    await enrol();
  });

  it('allows one TRIAL credit grant per workspace', async () => {
    const grant = {
      workspaceId: A.workspaceId,
      source: 'TRIAL',
      grantedMillicredits: 150_000n,
      remainingMillicredits: 150_000n,
      expiresAt: new Date(Date.now() + 86_400_000),
    } as const;
    await prisma.creditGrant.create({ data: grant });
    await expectPrismaError(prisma.creditGrant.create({ data: grant }), 'P2002');
  });
});

describe('CHECK constraints', () => {
  it('keeps credit balances between 0 and the granted amount', async () => {
    const base = {
      workspaceId: A.workspaceId,
      source: 'ADJUSTMENT',
      expiresAt: new Date(Date.now() + 86_400_000),
    } as const;
    await rejectsWith(
      prisma.creditGrant.create({
        data: { ...base, grantedMillicredits: 1_000n, remainingMillicredits: -1n },
      }),
      /credit_grants_balance_chk/,
    );
    await rejectsWith(
      prisma.creditGrant.create({
        data: { ...base, grantedMillicredits: 1_000n, remainingMillicredits: 1_001n },
      }),
      /credit_grants_balance_chk/,
    );
  });

  it('keeps scores in 0..100', async () => {
    await rejectsWith(
      prisma.lead.update({ where: { id: A.ids.lead }, data: { score: 101 } }),
      /leads_score_range_chk/,
    );
    await rejectsWith(
      prisma.leadScore.create({
        data: {
          workspaceId: A.workspaceId,
          leadId: A.ids.lead,
          score: 90,
          tier: 'A',
          breakdown: {},
          scoringVersion: 'v1',
          icpVersion: 1,
          aiAdjustment: 16,
        },
      }),
      /lead_scores_ai_adjustment_range_chk/,
    );
  });

  it('requires field provenance to point at exactly one record', async () => {
    const source = await prisma.dataSource.create({
      data: {
        workspaceId: A.workspaceId,
        type: 'MANUAL',
        provider: 'manual',
        lawfulBasis: 'LEGITIMATE_INTEREST',
        retrievedAt: new Date(),
      },
    });
    const base = {
      workspaceId: A.workspaceId,
      dataSourceId: source.id,
      field: 'email',
      observedAt: new Date(),
    };
    await rejectsWith(
      prisma.fieldProvenance.create({ data: base }),
      /field_provenance_one_target_chk/,
    );
    await rejectsWith(
      prisma.fieldProvenance.create({
        data: { ...base, contactId: A.ids.contact, companyId: A.ids.company },
      }),
      /field_provenance_one_target_chk/,
    );
    await prisma.fieldProvenance.create({ data: { ...base, contactId: A.ids.contact } });
  });

  it('requires a suppression to target an email hash or a domain', async () => {
    await rejectsWith(
      prisma.suppression.create({ data: { workspaceId: A.workspaceId, reason: 'MANUAL' } }),
      /suppressions_target_chk/,
    );
  });
});

describe('delete policies', () => {
  it('blocks deleting an ICP that a campaign still uses (NO ACTION)', async () => {
    await expectPrismaError(prisma.icp.delete({ where: { id: A.ids.icp } }), 'P2003');
  });

  it('blocks deleting a contact that is enrolled in a campaign', async () => {
    await expectPrismaError(prisma.contact.delete({ where: { id: A.ids.contact } }), 'P2003');
  });

  it('cascades a workspace purge through every table, including NO ACTION references', async () => {
    const C = await createTenantFixture(prisma, 'con-purge');
    await prisma.auditLog.create({
      data: { workspaceId: C.workspaceId, actorType: 'SYSTEM', action: 'fixture.created' },
    });
    await prisma.workspace.delete({ where: { id: C.workspaceId } });

    const where = { workspaceId: C.workspaceId };
    const remaining = await Promise.all([
      prisma.workspaceMember.count({ where }),
      prisma.contact.count({ where }),
      prisma.company.count({ where }),
      prisma.lead.count({ where }),
      prisma.campaign.count({ where }),
      prisma.campaignRecipient.count({ where }),
      prisma.message.count({ where }),
      prisma.conversation.count({ where }),
      prisma.meeting.count({ where }),
      prisma.auditLog.count({ where }),
    ]);
    expect(remaining.every((n) => n === 0)).toBe(true);
    await prisma.user.delete({ where: { id: C.ownerId } });
  });
});

describe('append-only tables for the application role', () => {
  it('lets the app role insert and read audit logs but never change or delete them', async (ctx) => {
    const [{ owner, canUpdate }] = await prisma.$queryRaw<{ owner: boolean; canUpdate: boolean }[]>`
      SELECT pg_get_userbyid(relowner) = current_user AS owner,
             has_table_privilege(current_user, 'audit_logs', 'UPDATE') AS "canUpdate"
      FROM pg_class WHERE oid = 'public.audit_logs'::regclass`.then(
      (rows) => rows as [{ owner: boolean; canUpdate: boolean }],
    );
    // CI connects as the schema owner, which keeps all privileges. Locally DATABASE_URL is lga_app.
    if (owner) ctx.skip();
    expect(canUpdate).toBe(false);

    const row = await prisma.auditLog.create({
      data: { workspaceId: A.workspaceId, actorType: 'SYSTEM', action: 'fixture.checked' },
    });
    await rejectsWith(
      prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
      /permission denied/i,
    );
    await rejectsWith(prisma.auditLog.delete({ where: { id: row.id } }), /permission denied/i);
    await rejectsWith(
      prisma.usageLedger.deleteMany({ where: { workspaceId: A.workspaceId } }),
      /permission denied/i,
    );
    await rejectsWith(
      prisma.messageEvent.updateMany({
        where: { workspaceId: A.workspaceId },
        data: { metadata: {} },
      }),
      /permission denied/i,
    );
  });
});
