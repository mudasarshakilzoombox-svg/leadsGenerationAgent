// Development seed data: two workspaces with a realistic slice of every area.
// - Idempotent: fixed ids + createMany({ skipDuplicates }), so a re-run inserts nothing.
// - No real people or credentials: reserved .test/.example domains, encrypted fields left null,
//   seed users share the dev-only password DEV_SEED_PASSWORD (the seed is refused in production).
import { createHash } from 'node:crypto';
import { PasswordHasher } from '../modules/identity/infrastructure/password-hasher.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Deterministic, valid UUIDs: group (entity type) + sequence number. */
export function seedId(group: number, n: number): string {
  return `0195f000-0000-7000-8000-${group.toString(16).padStart(4, '0')}${n.toString(16).padStart(8, '0')}`;
}

const sha256 = (value: string) => Uint8Array.from(createHash('sha256').update(value).digest());
const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');
const DAY = 86_400_000;

/** Local development only: every seeded user signs in with this password. */
export const DEV_SEED_PASSWORD = 'lga-local-dev-password';

export const SEED = {
  users: {
    olivia: seedId(1, 1),
    adam: seedId(1, 2),
    mia: seedId(1, 3),
    noah: seedId(1, 4),
    superAdmin: seedId(1, 5),
  },
  workspaces: { acme: seedId(2, 1), northwind: seedId(2, 2) },
  businessProfiles: { brightdesk: seedId(8, 1), peak: seedId(8, 2), northwind: seedId(8, 3) },
  icps: { brightdesk: seedId(11, 1), northwind: seedId(11, 3) },
  contacts: {
    jane: seedId(14, 1),
    john: seedId(14, 2),
    ana: seedId(14, 3),
    sam: seedId(14, 4),
    janeNorthwind: seedId(14, 5),
    deleted: seedId(14, 6),
  },
  campaigns: { brightdesk: seedId(25, 1), northwindPilot: seedId(25, 2) },
} as const;

export interface SeedSummary {
  workspaces: number;
  users: number;
  inserted: number;
}

export async function seedDevData(prisma: PrismaClient, now = new Date()): Promise<SeedSummary> {
  const at = (days: number) => new Date(now.getTime() + days * DAY);
  const period = now.toISOString().slice(0, 7);
  const {
    users: U,
    workspaces: W,
    businessProfiles: BP,
    icps: I,
    contacts: CT,
    campaigns: CMP,
  } = SEED;
  let inserted = 0;
  const add = (result: { count: number }) => {
    inserted += result.count;
  };
  const skipDuplicates = true;

  // Identity ------------------------------------------------------------------------------
  const user = (id: string, email: string, name: string, extra: object = {}) => ({
    id,
    email,
    emailNormalized: email.toLowerCase(),
    name,
    emailVerifiedAt: at(-30),
    locale: 'en',
    timezone: 'Europe/London',
    termsVersionAccepted: '2026-11',
    termsAcceptedAt: at(-30),
    ...extra,
  });
  add(
    await prisma.user.createMany({
      skipDuplicates,
      data: [
        user(U.olivia, 'olivia.owner@acme-growth.test', 'Olivia Owner'),
        user(U.adam, 'adam.admin@acme-growth.test', 'Adam Admin'),
        user(U.mia, 'mia.member@acme-growth.test', 'Mia Member'),
        user(U.noah, 'noah.owner@northwind.test', 'Noah Owner'),
        user(U.superAdmin, 'platform.admin@lga.test', 'Platform Admin', {
          platformRole: 'SUPER_ADMIN',
        }),
      ],
    }),
  );

  // Workspaces --------------------------------------------------------------------------------
  add(
    await prisma.workspace.createMany({
      skipDuplicates,
      data: [
        {
          id: W.acme,
          name: 'Acme Growth Agency',
          slug: 'acme-growth',
          legalName: 'Acme Growth Agency Ltd',
          planKey: 'agency',
          status: 'ACTIVE',
          physicalAddress: {
            line1: '1 Example Street',
            city: 'London',
            postalCode: 'EC1A 1AA',
            country: 'GB',
          },
          privacyNoticeUrl: 'https://acme-growth.test/privacy',
          defaultTimezone: 'Europe/London',
          settings: { launchRequiresApproval: true },
        },
        {
          id: W.northwind,
          name: 'Northwind Startup',
          slug: 'northwind',
          planKey: 'starter',
          status: 'ACTIVE',
          physicalAddress: {
            line1: '500 Sample Avenue',
            city: 'Austin',
            region: 'TX',
            postalCode: '73301',
            country: 'US',
          },
          privacyNoticeUrl: 'https://northwind.test/privacy',
          defaultTimezone: 'America/Chicago',
          settings: { launchRequiresApproval: false },
        },
      ],
    }),
  );
  add(
    await prisma.workspaceMember.createMany({
      skipDuplicates,
      data: [
        { id: seedId(3, 1), workspaceId: W.acme, userId: U.olivia, roleKey: 'OWNER' },
        {
          id: seedId(3, 2),
          workspaceId: W.acme,
          userId: U.adam,
          roleKey: 'ADMIN',
          invitedByUserId: U.olivia,
        },
        {
          id: seedId(3, 3),
          workspaceId: W.acme,
          userId: U.mia,
          roleKey: 'MEMBER',
          invitedByUserId: U.adam,
        },
        { id: seedId(3, 4), workspaceId: W.northwind, userId: U.noah, roleKey: 'OWNER' },
        // Mia belongs to both workspaces (isolation is per workspace, not per user).
        {
          id: seedId(3, 5),
          workspaceId: W.northwind,
          userId: U.mia,
          roleKey: 'ADMIN',
          invitedByUserId: U.noah,
        },
      ],
    }),
  );
  add(
    await prisma.invitation.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(40, 1),
          workspaceId: W.acme,
          emailNormalized: 'new.hire@acme-growth.test',
          roleKey: 'MEMBER',
          tokenHash: sha256('dev-seed-invitation-token'),
          invitedByUserId: U.adam,
          expiresAt: at(7),
        },
      ],
    }),
  );

  // Billing -----------------------------------------------------------------------------------
  add(
    await prisma.subscription.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(4, 1),
          workspaceId: W.acme,
          planKey: 'agency',
          provider: 'STRIPE',
          externalCustomerId: 'cus_dev_acme',
          externalSubscriptionId: 'sub_dev_acme',
          status: 'ACTIVE',
          extraMailboxes: 2,
          currentPeriodStart: at(-10),
          currentPeriodEnd: at(20),
        },
        {
          id: seedId(4, 2),
          workspaceId: W.northwind,
          planKey: 'starter',
          provider: 'STRIPE',
          externalCustomerId: 'cus_dev_northwind',
          externalSubscriptionId: 'sub_dev_northwind',
          billingInterval: 'ANNUAL',
          status: 'ACTIVE',
          currentPeriodStart: at(-40),
          currentPeriodEnd: at(325),
        },
      ],
    }),
  );
  add(
    await prisma.entitlement.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(5, 1),
          workspaceId: W.acme,
          key: 'mailboxes',
          value: 2n,
          source: 'ADD_ON',
          reason: 'Two extra mailboxes',
        },
        {
          id: seedId(5, 2),
          workspaceId: W.northwind,
          key: 'contactsStored',
          value: 15_000n,
          source: 'OVERRIDE',
          reason: 'Pilot allowance (dev seed)',
          grantedByUserId: U.superAdmin,
          expiresAt: at(60),
        },
      ],
    }),
  );
  const acmePlanGrant = seedId(6, 1);
  add(
    await prisma.creditGrant.createMany({
      skipDuplicates,
      data: [
        {
          id: acmePlanGrant,
          workspaceId: W.acme,
          source: 'PLAN',
          grantedMillicredits: 25_000_000n,
          remainingMillicredits: 24_997_000n,
          periodStart: at(-10),
          expiresAt: at(20),
          externalRef: 'in_dev_acme_1',
        },
        {
          id: seedId(6, 2),
          workspaceId: W.northwind,
          source: 'TRIAL',
          grantedMillicredits: 150_000n,
          remainingMillicredits: 0n,
          expiresAt: at(-26),
        },
        {
          id: seedId(6, 3),
          workspaceId: W.northwind,
          source: 'PLAN',
          grantedMillicredits: 2_000_000n,
          remainingMillicredits: 2_000_000n,
          periodStart: at(-10),
          expiresAt: at(20),
          externalRef: 'in_dev_northwind_1',
        },
      ],
    }),
  );
  add(
    await prisma.usageLedger.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(7, 1),
          workspaceId: W.acme,
          metric: 'CREDITS',
          action: 'VERIFICATION',
          quantity: 1_000n,
          status: 'SETTLED',
          grantDebits: [{ grantId: acmePlanGrant, millicredits: 1_000 }],
          period,
          referenceType: 'contact',
          referenceId: CT.jane,
          actorUserId: U.mia,
          idempotencyKey: 'seed_usage_1',
        },
        {
          id: seedId(7, 2),
          workspaceId: W.acme,
          metric: 'CREDITS',
          action: 'AI_DRAFT',
          quantity: 2_000n,
          status: 'SETTLED',
          grantDebits: [{ grantId: acmePlanGrant, millicredits: 2_000 }],
          period,
          referenceType: 'campaign',
          referenceId: CMP.brightdesk,
          actorUserId: U.mia,
          idempotencyKey: 'seed_usage_2',
        },
        {
          id: seedId(7, 3),
          workspaceId: W.acme,
          metric: 'EMAIL_SENT',
          quantity: 1n,
          status: 'SETTLED',
          period,
          referenceType: 'message',
          referenceId: seedId(31, 1),
          idempotencyKey: 'seed_usage_3',
        },
      ],
    }),
  );
  add(
    await prisma.webhookEvent.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(41, 1),
          workspaceId: W.acme,
          provider: 'stripe',
          externalId: 'evt_dev_acme_1',
          eventType: 'invoice.paid',
          signatureValid: true,
          status: 'PROCESSED',
          payload: { id: 'evt_dev_acme_1', type: 'invoice.paid' },
          attempts: 1,
          processedAt: at(-10),
        },
      ],
    }),
  );
  add(
    await prisma.paymentEvent.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(42, 1),
          workspaceId: W.acme,
          provider: 'STRIPE',
          externalEventId: 'evt_dev_acme_1',
          type: 'invoice.paid',
          externalInvoiceId: 'in_dev_acme_1',
          amountMinor: 29_900,
          currency: 'USD',
          occurredAt: at(-10),
          webhookEventId: seedId(41, 1),
          payload: { invoice: 'in_dev_acme_1' },
        },
      ],
    }),
  );

  // Background jobs (referenced by analyses and data sources) ------------------------------------
  add(
    await prisma.backgroundJob.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(39, 1),
          workspaceId: W.acme,
          type: 'website.analyze',
          queue: 'analysis',
          status: 'SUCCEEDED',
          entityType: 'business_profile',
          entityId: BP.brightdesk,
          idempotencyKey: 'seed_job_1',
          attempts: 1,
          progress: { pagesFetched: 6, pagesTotal: 6 },
          startedAt: at(-20),
          finishedAt: at(-20),
          createdByUserId: U.mia,
        },
        {
          id: seedId(39, 2),
          workspaceId: W.northwind,
          type: 'import.process',
          queue: 'imports',
          status: 'SUCCEEDED',
          entityType: 'import_batch',
          entityId: seedId(22, 1),
          idempotencyKey: 'seed_job_2',
          attempts: 1,
          progress: { rows: 2, done: 2 },
          startedAt: at(-5),
          finishedAt: at(-5),
          createdByUserId: U.noah,
        },
      ],
    }),
  );

  // Business understanding ------------------------------------------------------------------------
  add(
    await prisma.businessProfile.createMany({
      skipDuplicates,
      data: [
        {
          id: BP.brightdesk,
          workspaceId: W.acme,
          name: 'Brightdesk',
          websiteUrl: 'https://brightdesk.test',
          domain: 'brightdesk.test',
          status: 'READY',
          summary: 'Help desk software for fast-growing SaaS support teams.',
          valueProposition: 'Cut first-response time in half without adding headcount.',
          industriesServed: ['Software', 'E-commerce'],
          targetMarkets: ['GB', 'US'],
          differentiators: ['AI triage', 'Two-week onboarding'],
          proofPoints: [
            { text: '42% faster first response', sourceUrl: 'https://brightdesk.test/customers' },
          ],
          brandVoice: { tone: 'friendly', formality: 'medium' },
          editedFields: ['valueProposition'],
          lastAnalyzedAt: at(-20),
        },
        {
          id: BP.peak,
          workspaceId: W.acme,
          name: 'Peak Logistics',
          websiteUrl: 'https://peaklogistics.test',
          domain: 'peaklogistics.test',
          status: 'DRAFT',
        },
        {
          id: BP.northwind,
          workspaceId: W.northwind,
          name: 'Northwind',
          websiteUrl: 'https://northwind.test',
          domain: 'northwind.test',
          status: 'READY',
          summary: 'Retail analytics for independent store chains.',
          industriesServed: ['Retail'],
          targetMarkets: ['US'],
          lastAnalyzedAt: at(-6),
        },
      ],
    }),
  );
  add(
    await prisma.offering.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(9, 1),
          workspaceId: W.acme,
          businessProfileId: BP.brightdesk,
          type: 'PRODUCT',
          name: 'Brightdesk Helpdesk',
          description: 'Shared inbox, AI triage and SLA reporting.',
          keyFeatures: ['AI triage', 'SLA alerts'],
          useCases: ['Scaling support without hiring'],
        },
        {
          id: seedId(9, 2),
          workspaceId: W.acme,
          businessProfileId: BP.peak,
          type: 'SERVICE',
          name: 'Freight audit',
          origin: 'USER',
        },
        {
          id: seedId(9, 3),
          workspaceId: W.northwind,
          businessProfileId: BP.northwind,
          type: 'PRODUCT',
          name: 'Northwind Analytics',
        },
      ],
    }),
  );
  add(
    await prisma.websiteAnalysis.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(10, 1),
          workspaceId: W.acme,
          businessProfileId: BP.brightdesk,
          status: 'COMPLETED',
          pagesDiscovered: 9,
          pagesFetched: 6,
          pages: [
            {
              url: 'https://brightdesk.test/',
              pageType: 'home',
              title: 'Brightdesk',
              contentHash: sha256Hex('home'),
            },
            {
              url: 'https://brightdesk.test/pricing',
              pageType: 'pricing',
              title: 'Pricing',
              contentHash: sha256Hex('pricing'),
            },
          ],
          extraction: { schemaVersion: 1, offerings: 1 },
          contentPurgeAfter: at(10),
          backgroundJobId: seedId(39, 1),
          triggeredByUserId: U.mia,
          startedAt: at(-20),
          finishedAt: at(-20),
        },
      ],
    }),
  );
  add(
    await prisma.icp.createMany({
      skipDuplicates,
      data: [
        {
          id: I.brightdesk,
          workspaceId: W.acme,
          businessProfileId: BP.brightdesk,
          name: 'SaaS support teams (50-500 staff)',
          status: 'ACTIVE',
          offeringIds: [seedId(9, 1)],
          firmographics: {
            industries: ['Software'],
            employeeRanges: ['51-200', '201-500'],
            countries: ['GB', 'US'],
          },
          exclusions: { domains: ['competitor.example'] },
          painPoints: ['Slow first response', 'Ticket backlog'],
          buyingTriggers: ['New support leader', 'Funding round'],
          rationale: 'Support headcount grows faster than ticket volume.',
          createdByUserId: U.mia,
          activatedAt: at(-18),
        },
        {
          id: I.northwind,
          workspaceId: W.northwind,
          businessProfileId: BP.northwind,
          name: 'Independent retail chains',
          status: 'ACTIVE',
          firmographics: { industries: ['Retail'], employeeRanges: ['51-200'], countries: ['US'] },
          origin: 'USER',
          createdByUserId: U.noah,
          activatedAt: at(-6),
        },
      ],
    }),
  );
  add(
    await prisma.targetSegment.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(12, 1),
          workspaceId: W.acme,
          icpId: I.brightdesk,
          name: 'Heads of Support',
          titleKeywords: ['head of support', 'support director', 'vp customer support'],
          seniorities: ['DIRECTOR', 'VP'],
          departments: ['Customer Support'],
          painPoints: ['Backlog during launches'],
          messagingAngles: ['Response-time benchmarks'],
          priority: 1,
        },
        {
          id: seedId(12, 3),
          workspaceId: W.northwind,
          icpId: I.northwind,
          name: 'Operations leaders',
          titleKeywords: ['coo', 'head of operations'],
          seniorities: ['C_LEVEL', 'DIRECTOR'],
          departments: ['Operations'],
        },
      ],
    }),
  );

  // Lead management ---------------------------------------------------------------------------------
  add(
    await prisma.providerConnection.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(21, 1),
          workspaceId: W.acme,
          provider: 'apollo',
          category: 'DATA',
          config: { mode: 'fake' },
        },
        {
          id: seedId(21, 2),
          workspaceId: W.acme,
          provider: 'smtp',
          category: 'MAILBOX',
          ownerUserId: U.mia,
        },
        {
          id: seedId(21, 3),
          workspaceId: W.northwind,
          provider: 'hunter',
          category: 'VERIFICATION',
          config: { mode: 'fake' },
        },
      ],
    }),
  );
  add(
    await prisma.importBatch.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(22, 1),
          workspaceId: W.northwind,
          fileName: 'trade-show-leads.csv',
          fileStorageKey: `ws/${W.northwind}/imports/${seedId(22, 1)}.csv`,
          fileSha256: sha256Hex('trade-show-leads.csv'),
          fileSizeBytes: 2_048,
          status: 'COMPLETED',
          columnMapping: { email: 'Email', firstName: 'First name', company: 'Company' },
          rowCount: 2,
          rowsImported: 2,
          lawfulBasis: 'CUSTOMER_PROVIDED',
          sourceDescription: 'Badge scans from our own trade show stand (dev seed)',
          attestedByUserId: U.noah,
          attestedAt: at(-5),
          createdByUserId: U.noah,
          startedAt: at(-5),
          finishedAt: at(-5),
        },
      ],
    }),
  );
  add(
    await prisma.dataSource.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(19, 1),
          workspaceId: W.acme,
          type: 'PROVIDER_API',
          provider: 'apollo',
          providerConnectionId: seedId(21, 1),
          lawfulBasis: 'LEGITIMATE_INTEREST',
          retrievedAt: at(-15),
          costMicros: 0n,
          actorUserId: U.mia,
        },
        {
          id: seedId(19, 2),
          workspaceId: W.acme,
          type: 'MANUAL',
          provider: 'manual',
          lawfulBasis: 'LEGITIMATE_INTEREST',
          retrievedAt: at(-14),
          actorUserId: U.adam,
        },
        {
          id: seedId(19, 3),
          workspaceId: W.northwind,
          type: 'CSV_IMPORT',
          provider: 'csv_import',
          importBatchId: seedId(22, 1),
          backgroundJobId: seedId(39, 2),
          lawfulBasis: 'CUSTOMER_PROVIDED',
          retrievedAt: at(-5),
          actorUserId: U.noah,
        },
      ],
    }),
  );
  add(
    await prisma.company.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(13, 1),
          workspaceId: W.acme,
          name: 'Globex Software',
          domain: 'globex.example',
          websiteUrl: 'https://globex.example',
          industry: 'Software',
          employeeCount: 180,
          employeeRange: '51-200',
          hqCountry: 'GB',
          hqCity: 'Manchester',
          technologies: ['zendesk', 'slack'],
          fundingStage: 'series_b',
          enrichedAt: at(-15),
        },
        {
          id: seedId(13, 2),
          workspaceId: W.acme,
          name: 'Initech',
          domain: 'initech.example',
          industry: 'Software',
          employeeCount: 320,
          employeeRange: '201-500',
          hqCountry: 'US',
          technologies: ['freshdesk'],
        },
        {
          id: seedId(13, 3),
          workspaceId: W.northwind,
          name: 'Umbrella Retail',
          domain: 'umbrella.example',
          industry: 'Retail',
          employeeCount: 90,
          employeeRange: '51-200',
          hqCountry: 'US',
        },
        // The same company can exist independently in another workspace.
        {
          id: seedId(13, 4),
          workspaceId: W.northwind,
          name: 'Globex Software',
          domain: 'globex.example',
          industry: 'Software',
        },
      ],
    }),
  );
  const contact = (
    id: string,
    workspaceId: string,
    companyId: string,
    first: string,
    last: string,
    email: string,
    extra: object = {},
  ) => ({
    id,
    workspaceId,
    companyId,
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`,
    email,
    emailNormalized: email.toLowerCase(),
    lawfulBasis: 'LEGITIMATE_INTEREST' as const,
    source: 'DISCOVERY' as const,
    ...extra,
  });
  add(
    await prisma.contact.createMany({
      skipDuplicates,
      data: [
        contact(CT.jane, W.acme, seedId(13, 1), 'Jane', 'Doe', 'jane.doe@globex.example', {
          title: 'Head of Support',
          seniority: 'DIRECTOR',
          department: 'Customer Support',
          emailStatus: 'VALID',
          emailVerifiedAt: at(-14),
          country: 'GB',
          timezone: 'Europe/London',
          lastContactedAt: at(-3),
        }),
        contact(CT.john, W.acme, seedId(13, 2), 'John', 'Roe', 'john.roe@initech.example', {
          title: 'Support Manager',
          seniority: 'MANAGER',
          emailStatus: 'VALID',
          country: 'US',
          timezone: 'America/New_York',
        }),
        contact(CT.ana, W.acme, seedId(13, 1), 'Ana', 'Smith', 'ana.smith@globex.example', {
          title: 'Support Team Lead',
          seniority: 'SENIOR',
          emailStatus: 'CATCH_ALL',
        }),
        contact(
          CT.deleted,
          W.acme,
          seedId(13, 2),
          'Old',
          'Contact',
          'old.contact@initech.example',
          {
            source: 'MANUAL',
            deletedAt: at(-2),
          },
        ),
        contact(CT.sam, W.northwind, seedId(13, 3), 'Sam', 'Lee', 'sam.lee@umbrella.example', {
          title: 'COO',
          seniority: 'C_LEVEL',
          lawfulBasis: 'CUSTOMER_PROVIDED',
          source: 'IMPORT',
          emailStatus: 'VALID',
        }),
        // Same person and email as in Acme: allowed, because uniqueness is per workspace.
        contact(
          CT.janeNorthwind,
          W.northwind,
          seedId(13, 4),
          'Jane',
          'Doe',
          'jane.doe@globex.example',
          {
            lawfulBasis: 'CUSTOMER_PROVIDED',
            source: 'IMPORT',
          },
        ),
      ],
    }),
  );
  add(
    await prisma.fieldProvenance.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(20, 1),
          workspaceId: W.acme,
          dataSourceId: seedId(19, 1),
          contactId: CT.jane,
          field: 'email',
          externalRecordId: 'apollo_person_dev_1',
          valueHash: sha256('jane.doe@globex.example'),
          observedAt: at(-15),
        },
        {
          id: seedId(20, 2),
          workspaceId: W.acme,
          dataSourceId: seedId(19, 1),
          contactId: CT.jane,
          field: 'title',
          externalRecordId: 'apollo_person_dev_1',
          valueHash: sha256('Head of Support'),
          observedAt: at(-15),
        },
        {
          id: seedId(20, 3),
          workspaceId: W.acme,
          dataSourceId: seedId(19, 2),
          contactId: CT.jane,
          field: 'timezone',
          valueHash: sha256('Europe/London'),
          observedAt: at(-14),
        },
        {
          id: seedId(20, 4),
          workspaceId: W.acme,
          dataSourceId: seedId(19, 1),
          companyId: seedId(13, 1),
          field: 'employeeCount',
          externalRecordId: 'apollo_org_dev_1',
          valueHash: sha256('180'),
          observedAt: at(-15),
        },
        {
          id: seedId(20, 5),
          workspaceId: W.northwind,
          dataSourceId: seedId(19, 3),
          contactId: CT.sam,
          field: 'email',
          valueHash: sha256('sam.lee@umbrella.example'),
          observedAt: at(-5),
        },
      ],
    }),
  );
  add(
    await prisma.lead.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(15, 1),
          workspaceId: W.acme,
          contactId: CT.jane,
          icpId: I.brightdesk,
          segmentId: seedId(12, 1),
          ownerUserId: U.mia,
          stage: 'REPLIED',
          score: 86,
          tier: 'A',
          scoredAt: at(-14),
        },
        {
          id: seedId(15, 2),
          workspaceId: W.acme,
          contactId: CT.john,
          icpId: I.brightdesk,
          segmentId: seedId(12, 1),
          ownerUserId: U.mia,
          stage: 'ENROLLED',
          score: 68,
          tier: 'B',
          scoredAt: at(-14),
        },
        {
          id: seedId(15, 3),
          workspaceId: W.acme,
          contactId: CT.ana,
          icpId: I.brightdesk,
          stage: 'NEW',
          score: 41,
          tier: 'C',
          scoredAt: at(-14),
        },
        {
          id: seedId(15, 4),
          workspaceId: W.northwind,
          contactId: CT.sam,
          icpId: I.northwind,
          segmentId: seedId(12, 3),
          ownerUserId: U.noah,
          stage: 'QUALIFIED',
          score: 74,
          tier: 'B',
          scoredAt: at(-5),
        },
      ],
    }),
  );
  const breakdown = (fit: number, persona: number, dataQuality: number, reasons: string[]) => ({
    fit,
    persona,
    dataQuality,
    intent: 0,
    engagement: 0,
    aiAdjustment: 0,
    reasons,
    schemaVersion: 1,
  });
  add(
    await prisma.leadScore.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(16, 1),
          workspaceId: W.acme,
          leadId: seedId(15, 1),
          score: 86,
          tier: 'A',
          breakdown: breakdown(45, 28, 13, ['Industry match', 'Director-level support lead']),
          scoringVersion: 'v1',
          icpVersion: 1,
          computedAt: at(-14),
        },
        {
          id: seedId(16, 2),
          workspaceId: W.acme,
          leadId: seedId(15, 2),
          score: 68,
          tier: 'B',
          breakdown: breakdown(38, 18, 12, ['Industry match']),
          scoringVersion: 'v1',
          icpVersion: 1,
          computedAt: at(-14),
        },
        {
          id: seedId(16, 3),
          workspaceId: W.acme,
          leadId: seedId(15, 3),
          score: 41,
          tier: 'C',
          breakdown: breakdown(30, 8, 3, ['Catch-all email']),
          scoringVersion: 'v1',
          icpVersion: 1,
          computedAt: at(-14),
        },
        {
          id: seedId(16, 4),
          workspaceId: W.northwind,
          leadId: seedId(15, 4),
          score: 74,
          tier: 'B',
          breakdown: breakdown(40, 22, 12, ['C-level buyer']),
          scoringVersion: 'v1',
          icpVersion: 1,
          computedAt: at(-5),
        },
      ],
    }),
  );
  add(
    await prisma.leadActivity.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(17, 1),
          workspaceId: W.acme,
          leadId: seedId(15, 1),
          type: 'CREATED',
          occurredAt: at(-15),
          metadata: { dataSourceId: seedId(19, 1) },
        },
        {
          id: seedId(17, 2),
          workspaceId: W.acme,
          leadId: seedId(15, 1),
          type: 'SCORED',
          occurredAt: at(-14),
          metadata: { leadScoreId: seedId(16, 1) },
        },
        {
          id: seedId(17, 3),
          workspaceId: W.acme,
          leadId: seedId(15, 1),
          type: 'ENROLLED',
          actorType: 'USER',
          actorUserId: U.mia,
          occurredAt: at(-4),
          metadata: { campaignId: CMP.brightdesk },
        },
        {
          id: seedId(17, 4),
          workspaceId: W.acme,
          leadId: seedId(15, 1),
          type: 'EMAIL_SENT',
          occurredAt: at(-3),
          metadata: { messageId: seedId(31, 1) },
        },
        {
          id: seedId(17, 5),
          workspaceId: W.acme,
          leadId: seedId(15, 1),
          type: 'REPLIED',
          occurredAt: at(-2),
          metadata: { messageId: seedId(31, 2) },
        },
        {
          id: seedId(17, 6),
          workspaceId: W.northwind,
          leadId: seedId(15, 4),
          type: 'CREATED',
          occurredAt: at(-5),
          metadata: { importBatchId: seedId(22, 1) },
        },
      ],
    }),
  );
  add(
    await prisma.leadList.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(18, 1),
          workspaceId: W.acme,
          name: 'Brightdesk - tier A',
          createdByUserId: U.mia,
        },
        {
          id: seedId(18, 2),
          workspaceId: W.northwind,
          name: 'Trade show follow-ups',
          createdByUserId: U.noah,
        },
      ],
    }),
  );
  add(
    await prisma.leadListMember.createMany({
      skipDuplicates,
      data: [
        {
          workspaceId: W.acme,
          leadListId: seedId(18, 1),
          leadId: seedId(15, 1),
          addedByUserId: U.mia,
        },
        {
          workspaceId: W.acme,
          leadListId: seedId(18, 1),
          leadId: seedId(15, 2),
          addedByUserId: U.mia,
        },
        {
          workspaceId: W.northwind,
          leadListId: seedId(18, 2),
          leadId: seedId(15, 4),
          addedByUserId: U.noah,
        },
      ],
    }),
  );

  // Sending infrastructure ------------------------------------------------------------------------
  add(
    await prisma.sendingDomain.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(23, 1),
          workspaceId: W.acme,
          domain: 'acme-growth.test',
          spfStatus: 'PASS',
          dkimStatus: 'PASS',
          dmarcStatus: 'PASS',
          mxStatus: 'PASS',
          dmarcPolicy: 'quarantine',
          dkimSelectors: ['s1'],
          lastCheckedAt: at(-1),
        },
        {
          id: seedId(23, 2),
          workspaceId: W.northwind,
          domain: 'northwind.test',
          spfStatus: 'PASS',
          dkimStatus: 'MISSING',
          dmarcStatus: 'FAIL',
          mxStatus: 'PASS',
          lastCheckedAt: at(-1),
        },
      ],
    }),
  );
  add(
    await prisma.inboxConnection.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(24, 1),
          workspaceId: W.acme,
          ownerUserId: U.mia,
          providerConnectionId: seedId(21, 2),
          sendingDomainId: seedId(23, 1),
          provider: 'SMTP_IMAP',
          emailAddress: 'mia.member@acme-growth.test',
          emailNormalized: 'mia.member@acme-growth.test',
          displayName: 'Mia from Acme',
          signatureText: 'Mia Member\nAcme Growth Agency',
          dailyLimit: 30,
          smtpSavesSent: true,
          lastSyncedAt: at(-0.01),
          lastSentAt: at(-3),
          health: { bounceRate: 0, replyRate: 0.5 },
        },
        {
          id: seedId(24, 2),
          workspaceId: W.northwind,
          ownerUserId: U.noah,
          sendingDomainId: seedId(23, 2),
          provider: 'MICROSOFT',
          emailAddress: 'noah.owner@northwind.test',
          emailNormalized: 'noah.owner@northwind.test',
          status: 'PAUSED',
          statusReason: 'dns_incomplete',
        },
      ],
    }),
  );

  // Campaigns ---------------------------------------------------------------------------------------
  add(
    await prisma.campaign.createMany({
      skipDuplicates,
      data: [
        {
          id: CMP.brightdesk,
          workspaceId: W.acme,
          businessProfileId: BP.brightdesk,
          icpId: I.brightdesk,
          offeringId: seedId(9, 1),
          name: 'Brightdesk - Heads of Support',
          status: 'ACTIVE',
          autonomyLevel: 'L1',
          sendWindow: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
          dailyCap: 30,
          bookingUrl: 'https://cal.example/mia-acme',
          startAt: at(-4),
          launchedAt: at(-4),
          approvedByUserId: U.adam,
          approvedAt: at(-4),
          createdByUserId: U.mia,
        },
        {
          id: CMP.northwindPilot,
          workspaceId: W.northwind,
          businessProfileId: BP.northwind,
          icpId: I.northwind,
          offeringId: seedId(9, 3),
          name: 'Northwind pilot',
          createdByUserId: U.noah,
        },
      ],
    }),
  );
  add(
    await prisma.campaignStep.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(26, 1),
          workspaceId: W.acme,
          campaignId: CMP.brightdesk,
          stepOrder: 1,
          threadMode: 'NEW_THREAD',
          intent: 'INTRO',
          aiInstructions: 'Reference their support stack.',
        },
        {
          id: seedId(26, 2),
          workspaceId: W.acme,
          campaignId: CMP.brightdesk,
          stepOrder: 2,
          delayDays: 3,
          intent: 'FOLLOW_UP',
        },
        {
          id: seedId(26, 3),
          workspaceId: W.northwind,
          campaignId: CMP.northwindPilot,
          stepOrder: 1,
          threadMode: 'NEW_THREAD',
          intent: 'INTRO',
        },
      ],
    }),
  );
  add(
    await prisma.campaignMailbox.createMany({
      skipDuplicates,
      data: [{ workspaceId: W.acme, campaignId: CMP.brightdesk, inboxConnectionId: seedId(24, 1) }],
    }),
  );
  add(
    await prisma.campaignApproval.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(27, 1),
          workspaceId: W.acme,
          campaignId: CMP.brightdesk,
          requestedByUserId: U.mia,
          status: 'APPROVED',
          decidedByUserId: U.adam,
          decidedAt: at(-4),
          comment: 'Looks good.',
          launchCheckSnapshot: [{ check: 'physical_address', ok: true }],
          configHash: sha256Hex('brightdesk-campaign-v1'),
        },
      ],
    }),
  );
  add(
    await prisma.conversation.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(30, 1),
          workspaceId: W.acme,
          inboxConnectionId: seedId(24, 1),
          contactId: CT.jane,
          providerThreadId: 'imap-thread-dev-1',
          subject: 'Response times at Globex',
          assignedUserId: U.mia,
          isUnread: true,
          lastMessageAt: at(-2),
          lastInboundAt: at(-2),
        },
      ],
    }),
  );
  add(
    await prisma.campaignRecipient.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(28, 1),
          workspaceId: W.acme,
          campaignId: CMP.brightdesk,
          leadId: seedId(15, 1),
          contactId: CT.jane,
          inboxConnectionId: seedId(24, 1),
          conversationId: seedId(30, 1),
          status: 'REPLIED',
          currentStepOrder: 1,
          enrolledAt: at(-4),
          lastSentAt: at(-3),
          completedAt: at(-2),
          stopReason: 'replied',
        },
        {
          id: seedId(28, 2),
          workspaceId: W.acme,
          campaignId: CMP.brightdesk,
          leadId: seedId(15, 2),
          contactId: CT.john,
          inboxConnectionId: seedId(24, 1),
          status: 'ACTIVE',
          currentStepOrder: 0,
          nextActionAt: at(1),
          enrolledAt: at(-4),
        },
      ],
    }),
  );
  add(
    await prisma.messageDraft.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(29, 1),
          workspaceId: W.acme,
          recipientId: seedId(28, 1),
          stepId: seedId(26, 1),
          subject: 'Response times at Globex',
          bodyText:
            'Hi Jane,\n\nTeams like yours cut first-response time with Brightdesk...\n\nMia',
          status: 'SENT',
          contentHash: sha256Hex('draft-1'),
          approvedByUserId: U.mia,
          approvedAt: at(-3),
        },
        {
          id: seedId(29, 2),
          workspaceId: W.acme,
          recipientId: seedId(28, 2),
          stepId: seedId(26, 1),
          subject: 'Support backlog at Initech',
          bodyText: 'Hi John,\n\nQuick idea for keeping the queue short during launches...\n\nMia',
          status: 'NEEDS_REVIEW',
          lintWarnings: [{ code: 'LONG_SUBJECT', severity: 'info' }],
          contentHash: sha256Hex('draft-2'),
        },
      ],
    }),
  );
  add(
    await prisma.message.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(31, 1),
          workspaceId: W.acme,
          conversationId: seedId(30, 1),
          inboxConnectionId: seedId(24, 1),
          recipientId: seedId(28, 1),
          stepId: seedId(26, 1),
          draftId: seedId(29, 1),
          contactId: CT.jane,
          direction: 'OUTBOUND',
          status: 'SENT',
          rfcMessageId: `<${seedId(31, 1)}@acme-growth.test>`,
          fromEmail: 'mia.member@acme-growth.test',
          toEmails: ['jane.doe@globex.example'],
          subject: 'Response times at Globex',
          snippet: 'Teams like yours cut first-response time...',
          bodyText:
            'Hi Jane,\n\nTeams like yours cut first-response time with Brightdesk...\n\nMia',
          sentAt: at(-3),
        },
        {
          id: seedId(31, 2),
          workspaceId: W.acme,
          conversationId: seedId(30, 1),
          inboxConnectionId: seedId(24, 1),
          recipientId: seedId(28, 1),
          contactId: CT.jane,
          direction: 'INBOUND',
          status: 'RECEIVED',
          rfcMessageId: '<reply-dev-1@globex.example>',
          inReplyTo: `<${seedId(31, 1)}@acme-growth.test>`,
          references: [`<${seedId(31, 1)}@acme-growth.test>`],
          fromEmail: 'jane.doe@globex.example',
          toEmails: ['mia.member@acme-growth.test'],
          subject: 'Re: Response times at Globex',
          snippet: 'Happy to take a look, does Thursday work?',
          bodyText: 'Happy to take a look, does Thursday work?',
          receivedAt: at(-2),
        },
      ],
    }),
  );
  add(
    await prisma.replyClassification.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(35, 1),
          workspaceId: W.acme,
          messageId: seedId(31, 2),
          category: 'MEETING_REQUEST',
          confidence: '0.930',
          sentiment: 'POSITIVE',
          summary: 'Wants to meet on Thursday.',
          extracted: { questions: [] },
        },
      ],
    }),
  );
  const event = (
    n: number,
    type: 'SENT' | 'REPLIED' | 'POSITIVE_REPLY' | 'MEETING_BOOKED',
    messageId: string,
    days: number,
  ) => ({
    id: seedId(32, n),
    workspaceId: W.acme,
    messageId,
    campaignId: CMP.brightdesk,
    stepId: seedId(26, 1),
    recipientId: seedId(28, 1),
    inboxConnectionId: seedId(24, 1),
    contactId: CT.jane,
    type,
    dedupeKey: `${type.toLowerCase()}_${messageId}`,
    occurredAt: at(days),
  });
  add(
    await prisma.messageEvent.createMany({
      skipDuplicates,
      data: [
        event(1, 'SENT', seedId(31, 1), -3),
        event(2, 'REPLIED', seedId(31, 2), -2),
        event(3, 'POSITIVE_REPLY', seedId(31, 2), -2),
        event(4, 'MEETING_BOOKED', seedId(31, 2), -1),
      ],
    }),
  );

  // Compliance --------------------------------------------------------------------------------------
  const unsubscribed = 'former.lead@initech.example';
  add(
    await prisma.suppression.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(33, 1),
          workspaceId: W.acme,
          emailHash: sha256(`dev-seed:${unsubscribed}`),
          emailNormalized: unsubscribed,
          reason: 'UNSUBSCRIBED',
          sourceType: 'unsubscribe',
          sourceId: seedId(34, 1),
        },
        {
          id: seedId(33, 2),
          workspaceId: W.acme,
          domain: 'competitor.example',
          reason: 'COMPETITOR',
          createdByUserId: U.adam,
        },
        {
          id: seedId(33, 3),
          workspaceId: W.northwind,
          domain: 'umbrella-holdings.example',
          reason: 'EXISTING_CUSTOMER',
          createdByUserId: U.noah,
        },
      ],
    }),
  );
  add(
    await prisma.unsubscribe.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(34, 1),
          workspaceId: W.acme,
          suppressionId: seedId(33, 1),
          campaignId: CMP.brightdesk,
          method: 'ONE_CLICK',
          emailHash: sha256(`dev-seed:${unsubscribed}`),
          tokenKeyId: 'k1',
          occurredAt: at(-6),
        },
      ],
    }),
  );

  // Meetings ----------------------------------------------------------------------------------------
  add(
    await prisma.calendarConnection.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(36, 1),
          workspaceId: W.acme,
          userId: U.mia,
          provider: 'CAL_COM',
          externalAccountEmail: 'mia.member@acme-growth.test',
          bookingUrl: 'https://cal.example/mia-acme',
        },
      ],
    }),
  );
  add(
    await prisma.meeting.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(37, 1),
          workspaceId: W.acme,
          contactId: CT.jane,
          leadId: seedId(15, 1),
          campaignId: CMP.brightdesk,
          conversationId: seedId(30, 1),
          calendarConnectionId: seedId(36, 1),
          hostUserId: U.mia,
          source: 'BOOKING_LINK',
          provider: 'CAL_COM',
          externalEventId: 'cal_booking_dev_1',
          startsAt: at(2),
          endsAt: at(2 + 30 / 1_440),
          timezone: 'Europe/London',
          meetingUrl: 'https://meet.example/dev-1',
        },
      ],
    }),
  );

  // Audit -------------------------------------------------------------------------------------------
  add(
    await prisma.auditLog.createMany({
      skipDuplicates,
      data: [
        {
          id: seedId(38, 1),
          workspaceId: W.acme,
          actorType: 'USER',
          actorUserId: U.adam,
          action: 'campaign.launch_approved',
          targetType: 'campaign',
          targetId: CMP.brightdesk,
          metadata: { approvalId: seedId(27, 1) },
          createdAt: at(-4),
        },
        {
          id: seedId(38, 2),
          workspaceId: W.acme,
          actorType: 'USER',
          actorUserId: U.olivia,
          action: 'member.invited',
          targetType: 'invitation',
          targetId: seedId(40, 1),
          metadata: { roleKey: 'MEMBER' },
          createdAt: at(-1),
        },
        {
          id: seedId(38, 3),
          workspaceId: W.northwind,
          actorType: 'USER',
          actorUserId: U.noah,
          action: 'import.completed',
          targetType: 'import_batch',
          targetId: seedId(22, 1),
          metadata: { rows: 2 },
          createdAt: at(-5),
        },
        {
          id: seedId(38, 4),
          actorType: 'SUPPORT',
          actorUserId: U.superAdmin,
          action: 'entitlement.override_granted',
          targetType: 'workspace',
          targetId: W.northwind,
          metadata: { key: 'contactsStored' },
          createdAt: at(-3),
        },
      ],
    }),
  );

  // Only fills users without a password, so a re-run never resets a changed password.
  await prisma.user.updateMany({
    where: { id: { in: Object.values(U) }, passwordHash: null },
    data: { passwordHash: await new PasswordHasher().hash(DEV_SEED_PASSWORD) },
  });

  return { workspaces: 2, users: 5, inserted };
}
