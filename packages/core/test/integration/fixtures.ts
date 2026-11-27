// Test fixtures: an isolated workspace with a small graph of tenant data.
// Every fixture uses random slugs/emails, so test files never collide with each other or the seed.
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { expect } from 'vitest';
import type { PrismaService } from '../../src/database/prisma.service.js';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';

export function createTestPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 4, application_name: 'lga-core-it' }),
  });
}

/** WorkspaceAccessService only needs PrismaClient behaviour from PrismaService. */
export const asPrismaService = (prisma: PrismaClient) => prisma as unknown as PrismaService;

export async function createUser(prisma: PrismaClient, label: string) {
  const email = `${label}-${randomUUID().slice(0, 8)}@fixture.test`;
  return prisma.user.create({ data: { email, emailNormalized: email, name: `Fixture ${label}` } });
}

export type TenantFixture = Awaited<ReturnType<typeof createTenantFixture>>;

export async function createTenantFixture(prisma: PrismaClient, label: string) {
  const owner = await createUser(prisma, `${label}-owner`);
  const suffix = randomUUID().slice(0, 8);
  const workspace = await prisma.workspace.create({
    data: {
      name: `Fixture ${label}`,
      slug: `fixture-${label}-${suffix}`,
      planKey: 'trial',
      members: { create: { userId: owner.id, roleKey: 'OWNER' } },
    },
  });
  const workspaceId = workspace.id;

  const businessProfile = await prisma.businessProfile.create({
    data: {
      workspaceId,
      name: `Profile ${label}`,
      websiteUrl: `https://${suffix}.test`,
      domain: `${suffix}.test`,
    },
  });
  const icp = await prisma.icp.create({
    data: { workspaceId, businessProfileId: businessProfile.id, name: `ICP ${label}` },
  });
  const company = await prisma.company.create({
    data: { workspaceId, name: `Company ${label}`, domain: `company-${suffix}.example` },
  });
  const contact = await prisma.contact.create({
    data: {
      workspaceId,
      companyId: company.id,
      fullName: `Contact ${label}`,
      email: `contact-${suffix}@company-${suffix}.example`,
      emailNormalized: `contact-${suffix}@company-${suffix}.example`,
      lawfulBasis: 'LEGITIMATE_INTEREST',
      source: 'MANUAL',
    },
  });
  const lead = await prisma.lead.create({
    data: { workspaceId, contactId: contact.id, icpId: icp.id, score: 70, tier: 'B' },
  });
  const providerConnection = await prisma.providerConnection.create({
    data: { workspaceId, provider: 'fake', category: 'DATA' },
  });
  const inbox = await prisma.inboxConnection.create({
    data: {
      workspaceId,
      provider: 'SMTP_IMAP',
      emailAddress: `sender-${suffix}@fixture.test`,
      emailNormalized: `sender-${suffix}@fixture.test`,
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId,
      businessProfileId: businessProfile.id,
      icpId: icp.id,
      name: `Campaign ${label}`,
    },
  });
  const step = await prisma.campaignStep.create({
    data: { workspaceId, campaignId: campaign.id, stepOrder: 1, intent: 'INTRO' },
  });
  const conversation = await prisma.conversation.create({
    data: { workspaceId, inboxConnectionId: inbox.id, contactId: contact.id },
  });
  const recipient = await prisma.campaignRecipient.create({
    data: {
      workspaceId,
      campaignId: campaign.id,
      leadId: lead.id,
      contactId: contact.id,
      inboxConnectionId: inbox.id,
      conversationId: conversation.id,
      status: 'ACTIVE',
    },
  });
  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      inboxConnectionId: inbox.id,
      recipientId: recipient.id,
      stepId: step.id,
      contactId: contact.id,
      direction: 'OUTBOUND',
      status: 'SENT',
      rfcMessageId: `<${randomUUID()}@fixture.test>`,
      fromEmail: inbox.emailAddress,
      toEmails: [contact.email!],
    },
  });
  const suppression = await prisma.suppression.create({
    data: { workspaceId, domain: `blocked-${suffix}.example`, reason: 'MANUAL' },
  });
  const meeting = await prisma.meeting.create({
    data: {
      workspaceId,
      contactId: contact.id,
      leadId: lead.id,
      source: 'MANUAL',
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000 + 1_800_000),
    },
  });

  return {
    workspaceId,
    ownerId: owner.id,
    ids: {
      businessProfile: businessProfile.id,
      icp: icp.id,
      company: company.id,
      contact: contact.id,
      lead: lead.id,
      providerConnection: providerConnection.id,
      inboxConnection: inbox.id,
      campaign: campaign.id,
      campaignStep: step.id,
      conversation: conversation.id,
      campaignRecipient: recipient.id,
      message: message.id,
      suppression: suppression.id,
      meeting: meeting.id,
    },
  };
}

/** Deleting the workspace cascades to all of its rows (the purge path). Users are global. */
export async function destroyTenantFixture(
  prisma: PrismaClient,
  fixture: TenantFixture | undefined,
) {
  if (!fixture) return;
  await prisma.workspace.deleteMany({ where: { id: fixture.workspaceId } });
  await prisma.user.deleteMany({ where: { id: fixture.ownerId } });
}

export async function expectPrismaError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `expected Prisma error ${code}`).toBeInstanceOf(
    Prisma.PrismaClientKnownRequestError,
  );
  expect((error as Prisma.PrismaClientKnownRequestError).code).toBe(code);
}
