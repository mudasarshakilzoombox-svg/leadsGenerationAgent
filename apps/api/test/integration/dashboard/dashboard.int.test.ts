// Read-only dashboard endpoints (ADR-0035, ADR-0036 projects): shapes, filters, pagination, exact metrics
// (PRD ANA-01 AC3), no credential leakage, READ_ONLY access and cross-tenant isolation.
import {
  AnalyticsSchema,
  BillingSchema,
  CampaignDetailSchema,
  CompanyDetailSchema,
  ContactDetailSchema,
  ConversationDetailSchema,
  IcpOverviewSchema,
  IntegrationsSchema,
  LeadListDetailSchema,
  OverviewSchema,
  ProjectsSchema,
  type SentItem,
  SequencesSchema,
} from '@lga/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Harness, type TestUser } from '../auth/harness.js';

let h: Harness;
let owner: TestUser;
let reader: TestUser & { memberId: string };
let outsider: TestUser;
let ws: string;
let outsiderWs: string;
const ids: Record<string, string> = {};

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function seedGraph(workspaceId: string) {
  const p = h.prisma;
  const profile = await p.businessProfile.create({
    data: {
      workspaceId,
      name: 'Dash Profile',
      websiteUrl: 'https://dash.test',
      domain: `dash-${workspaceId.slice(-6)}.test`,
      status: 'READY',
      lastAnalyzedAt: ago(3),
    },
  });
  const icp = await p.icp.create({
    data: {
      workspaceId,
      businessProfileId: profile.id,
      name: 'Dash ICP',
      status: 'ACTIVE',
      painPoints: ['Slow replies'],
      firmographics: { industries: ['Software'] },
    },
  });
  await p.targetSegment.create({
    data: {
      workspaceId,
      icpId: icp.id,
      name: 'Support leads',
      titleKeywords: ['head of support'],
      seniorities: ['DIRECTOR'],
    },
  });
  const company = await p.company.create({
    data: { workspaceId, name: 'Zeta Systems', domain: 'zeta.example', industry: 'Software' },
  });
  const source = await p.dataSource.create({
    data: {
      workspaceId,
      type: 'PROVIDER_API',
      provider: 'apollo',
      lawfulBasis: 'LEGITIMATE_INTEREST',
      retrievedAt: ago(2),
    },
  });
  const contacts = [];
  for (const [i, name] of ['Ada Lovelace', 'Alan Turing', 'Grace Hopper'].entries()) {
    contacts.push(
      await p.contact.create({
        data: {
          workspaceId,
          companyId: company.id,
          fullName: name,
          email: `${name.split(' ')[0]!.toLowerCase()}@zeta.example`,
          emailNormalized: `${name.split(' ')[0]!.toLowerCase()}@zeta.example`,
          emailStatus: i === 2 ? 'CATCH_ALL' : 'VALID',
          lawfulBasis: 'LEGITIMATE_INTEREST',
          source: 'DISCOVERY',
          createdAt: new Date(Date.now() - (3 - i) * 1000),
        },
      }),
    );
  }
  await p.fieldProvenance.create({
    data: {
      workspaceId,
      dataSourceId: source.id,
      contactId: contacts[0]!.id,
      field: 'email',
      observedAt: ago(2),
    },
  });
  await p.fieldProvenance.create({
    data: {
      workspaceId,
      dataSourceId: source.id,
      companyId: company.id,
      field: 'industry',
      observedAt: ago(2),
    },
  });
  const leads = [];
  for (const [i, tier] of (['A', 'B', 'C'] as const).entries()) {
    leads.push(
      await p.lead.create({
        data: {
          workspaceId,
          contactId: contacts[i]!.id,
          icpId: icp.id,
          tier,
          score: 90 - i * 20,
          stage: 'QUALIFIED',
          createdAt: new Date(Date.now() - (3 - i) * 1000),
        },
      }),
    );
  }
  await p.leadScore.create({
    data: {
      workspaceId,
      leadId: leads[0]!.id,
      score: 90,
      tier: 'A',
      breakdown: { reasons: ['Industry match'] },
      scoringVersion: 'v1',
      icpVersion: 1,
    },
  });
  const list = await p.leadList.create({ data: { workspaceId, name: 'Top tier' } });
  await p.leadListMember.create({
    data: { workspaceId, leadListId: list.id, leadId: leads[0]!.id },
  });

  const provider = await p.providerConnection.create({
    data: {
      workspaceId,
      provider: 'smtp',
      category: 'MAILBOX',
      credentialsEncrypted: Buffer.from('SECRET-CIPHERTEXT'),
    },
  });
  const inbox = await p.inboxConnection.create({
    data: {
      workspaceId,
      providerConnectionId: provider.id,
      provider: 'SMTP_IMAP',
      emailAddress: `sender@${workspaceId.slice(-6)}.test`,
      emailNormalized: `sender@${workspaceId.slice(-6)}.test`,
    },
  });
  await p.sendingDomain.create({
    data: {
      workspaceId,
      domain: `${workspaceId.slice(-6)}.test`,
      spfStatus: 'PASS',
      dkimStatus: 'PASS',
      dmarcStatus: 'FAIL',
    },
  });
  const campaign = await p.campaign.create({
    data: {
      workspaceId,
      businessProfileId: profile.id,
      icpId: icp.id,
      name: 'Dash Campaign',
      status: 'ACTIVE',
      launchedAt: ago(5),
    },
  });
  const step1 = await p.campaignStep.create({
    data: { workspaceId, campaignId: campaign.id, stepOrder: 1, intent: 'INTRO' },
  });
  const step2 = await p.campaignStep.create({
    data: { workspaceId, campaignId: campaign.id, stepOrder: 2, intent: 'FOLLOW_UP', delayDays: 3 },
  });
  await p.campaignMailbox.create({
    data: { workspaceId, campaignId: campaign.id, inboxConnectionId: inbox.id },
  });
  const conversation = await p.conversation.create({
    data: {
      workspaceId,
      inboxConnectionId: inbox.id,
      contactId: contacts[0]!.id,
      subject: 'Zeta support',
      isUnread: true,
      lastMessageAt: ago(1),
    },
  });
  const r1 = await p.campaignRecipient.create({
    data: {
      workspaceId,
      campaignId: campaign.id,
      leadId: leads[0]!.id,
      contactId: contacts[0]!.id,
      inboxConnectionId: inbox.id,
      conversationId: conversation.id,
      status: 'REPLIED',
    },
  });
  const r2 = await p.campaignRecipient.create({
    data: {
      workspaceId,
      campaignId: campaign.id,
      leadId: leads[1]!.id,
      contactId: contacts[1]!.id,
      inboxConnectionId: inbox.id,
      status: 'ACTIVE',
    },
  });
  await p.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      inboxConnectionId: inbox.id,
      recipientId: r1.id,
      stepId: step1.id,
      direction: 'OUTBOUND',
      status: 'SENT',
      rfcMessageId: `<out-${workspaceId}@t>`,
      fromEmail: inbox.emailAddress,
      toEmails: [contacts[0]!.email!],
      bodyText: 'Hello Ada',
      sentAt: ago(2),
    },
  });
  const reply = await p.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      inboxConnectionId: inbox.id,
      recipientId: r1.id,
      direction: 'INBOUND',
      status: 'RECEIVED',
      rfcMessageId: `<in-${workspaceId}@t>`,
      fromEmail: contacts[0]!.email!,
      toEmails: [inbox.emailAddress],
      bodyText: 'Sounds <b>good</b>',
      snippet: 'Sounds good',
      receivedAt: ago(1),
    },
  });
  await p.replyClassification.create({
    data: {
      workspaceId,
      messageId: reply.id,
      category: 'INTERESTED',
      confidence: '0.900',
      sentiment: 'POSITIVE',
    },
  });

  // Events in the last 30 days: 3 sent (2 enrollments), 1 reply + 1 positive (r1), 1 hard bounce (r2), 1 meeting.
  const ev = (
    type: string,
    recipientId: string,
    stepId: string | null,
    days: number,
    n: number,
  ) => ({
    workspaceId,
    campaignId: campaign.id,
    recipientId,
    stepId,
    inboxConnectionId: inbox.id,
    type: type as 'SENT',
    dedupeKey: `${type}-${recipientId}-${n}`,
    occurredAt: ago(days),
  });
  await p.messageEvent.createMany({
    data: [
      ev('SENT', r1.id, step1.id, 4, 1),
      ev('SENT', r1.id, step2.id, 2, 2),
      ev('SENT', r2.id, step1.id, 3, 3),
      ev('REPLIED', r1.id, step2.id, 1, 4),
      ev('POSITIVE_REPLY', r1.id, step2.id, 1, 5),
      ev('BOUNCED', r2.id, step1.id, 3, 6),
      ev('MEETING_BOOKED', r1.id, null, 1, 7),
      // Previous period (31-60 days ago): 1 sent.
      ev('SENT', r2.id, step1.id, 40, 8),
    ],
  });
  const meeting = await p.meeting.create({
    data: {
      workspaceId,
      contactId: contacts[0]!.id,
      campaignId: campaign.id,
      source: 'BOOKING_LINK',
      startsAt: new Date(Date.now() + DAY),
      endsAt: new Date(Date.now() + DAY + 1800_000),
    },
  });
  await p.creditGrant.create({
    data: {
      workspaceId,
      source: 'ADJUSTMENT',
      grantedMillicredits: 150_000n,
      remainingMillicredits: 120_000n,
      expiresAt: new Date(Date.now() + 30 * DAY),
    },
  });
  // Credits: 5 settled in range, 2 settled in the previous period, 9 still reserved (ignored).
  const ledger = (
    key: string,
    millicredits: bigint,
    status: 'SETTLED' | 'RESERVED',
    days: number,
  ) => ({
    workspaceId,
    metric: 'CREDITS' as const,
    action: 'verification',
    quantity: millicredits,
    status,
    period: ago(days).toISOString().slice(0, 7),
    idempotencyKey: `${workspaceId}-${key}`,
    createdAt: ago(days),
  });
  await p.usageLedger.createMany({
    data: [
      ledger('now', 5_000n, 'SETTLED', 2),
      ledger('before', 2_000n, 'SETTLED', 40),
      ledger('open', 9_000n, 'RESERVED', 1),
    ],
  });
  return {
    profile: profile.id,
    company: company.id,
    contact: contacts[0]!.id,
    list: list.id,
    campaign: campaign.id,
    conversation: conversation.id,
    meeting: meeting.id,
    lead: leads[0]!.id,
  };
}

beforeAll(async () => {
  h = await Harness.create();
  owner = await h.verifiedUser('dash-owner');
  ws = await h.createWorkspace(owner.client, 'Dashboard Co');
  await h.allowSeats(ws, 5);
  reader = await h.addMember(owner.client, ws, 'READ_ONLY', 'dash-reader');
  Object.assign(ids, await seedGraph(ws));
  outsider = await h.verifiedUser('dash-outsider');
  outsiderWs = await h.createWorkspace(outsider.client, 'Outsider Co');
});
afterAll(async () => h?.close());

const path = (p: string) => `/workspaces/${ws}/${p}`;

describe('overview and analytics', () => {
  it('computes KPIs exactly from message events, with previous-period change', async () => {
    const res = await owner.client.get(path('overview?range=30d'));
    expect(res.status).toBe(200);
    const o = OverviewSchema.parse(res.body);
    const kpi = Object.fromEntries(o.kpis.map((k) => [k.key, k]));
    expect(kpi.emailsSent).toMatchObject({ value: 3, previous: 1, change: 2 });
    expect(kpi.replyRate!.value).toBe(0.5); // 1 of 2 enrollments replied
    expect(kpi.positiveReplyRate!.value).toBe(0.5);
    expect(kpi.hardBounceRate!.value).toBeCloseTo(1 / 3);
    expect(kpi.meetingsBooked!.value).toBe(1);
    expect(kpi.newLeads!.value).toBe(3);
    expect(o.newLeadsByTier).toEqual({ A: 1, B: 1, C: 1, D: 0 });
    expect(o.series.reduce((s, p) => s + p.sent, 0)).toBe(3);
    expect(o.series.reduce((s, p) => s + p.replies, 0)).toBe(1);
    expect(o.attention).toMatchObject({ unreadReplies: 1, draftsToReview: 0, pendingApprovals: 0 });
    const checklist = Object.fromEntries(o.checklist.map((c) => [c.key, c.done]));
    expect(checklist).toMatchObject({
      verify_email: true,
      analyze_website: true,
      activate_icp: true,
      add_leads: true,
      verify_domain: false,
      launch_campaign: true,
    });
  });

  it('rejects unknown ranges and reports per-campaign and per-mailbox analytics', async () => {
    expect((await owner.client.get(path('overview?range=1y'))).status).toBe(400);
    const a = AnalyticsSchema.parse((await owner.client.get(path('analytics?range=7d'))).body);
    expect(a.campaigns[0]).toMatchObject({
      name: 'Dash Campaign',
      sent: 3,
      replies: 1,
      positive: 1,
      meetings: 1,
      replyRate: 0.5,
    });
    expect(a.mailboxes[0]).toMatchObject({ sent: 3, hardBounced: 1 });
    expect(a.credits.remaining).toBe(120);
  });
});

describe('projects and performance (ADR-0036)', () => {
  it('lists projects with their campaigns', async () => {
    const projects = ProjectsSchema.parse((await owner.client.get(path('projects'))).body);
    expect(projects.unreadReplies).toBe(1);
    const mine = projects.data.find((p) => p.id === ids.profile)!;
    expect(mine.campaigns).toEqual([{ id: ids.campaign, name: 'Dash Campaign', status: 'ACTIVE' }]);
  });

  it('computes performance cards exactly, for the workspace and for the project', async () => {
    for (const query of ['overview?range=30d', `overview?range=30d&project=${ids.profile}`]) {
      const o = OverviewSchema.parse((await owner.client.get(path(query))).body);
      const m = Object.fromEntries(o.performance.map((x) => [x.key, x]));
      expect(m.sent).toMatchObject({ value: 3, previous: 1, change: 2 });
      expect(m.delivered).toMatchObject({ value: 2, previous: 1 }); // 3 sent - 1 hard bounce
      expect(m.hotLeads).toMatchObject({ value: 1, previous: 0 }); // r1's positive reply
      expect(m.creditsUsed).toMatchObject({ value: 5, previous: 2, format: 'credits' });
      expect(m.sent!.series.reduce((sum, d) => sum + d.value, 0)).toBe(3);
      expect(m.delivered!.series.reduce((sum, d) => sum + d.value, 0)).toBe(2);
      expect(m.creditsUsed!.series.reduce((sum, d) => sum + d.value, 0)).toBe(5);
    }
    const filtered = OverviewSchema.parse(
      (
        await owner.client.get(
          path(`overview?range=30d&project=${ids.profile}&campaign=${ids.campaign}`),
        )
      ).body,
    );
    expect(filtered).toMatchObject({ projectId: ids.profile, campaignId: ids.campaign });
    // Credits cannot be narrowed to a campaign: the card says it is workspace-wide.
    expect(filtered.performance.find((x) => x.key === 'creditsUsed')!.scope).toBe('workspace');
  });

  it('shows empty numbers for a project without campaigns and 404s foreign filters', async () => {
    const other = await h.prisma.businessProfile.create({
      data: {
        workspaceId: ws,
        name: 'Empty Co',
        websiteUrl: 'https://empty.example',
        domain: 'empty.example',
      },
    });
    const o = OverviewSchema.parse(
      (await owner.client.get(path(`overview?range=30d&project=${other.id}`))).body,
    );
    const m = Object.fromEntries(o.performance.map((x) => [x.key, x]));
    expect(m.sent!.value).toBe(0);
    expect(m.delivered!.value).toBeNull(); // nothing sent: "no data", not 0
    // The campaign belongs to another project.
    expect(
      (await owner.client.get(path(`overview?project=${other.id}&campaign=${ids.campaign}`)))
        .status,
    ).toBe(404);
    const foreign = await h.prisma.businessProfile.create({
      data: {
        workspaceId: outsiderWs,
        name: 'Foreign',
        websiteUrl: 'https://f.example',
        domain: 'f.example',
      },
    });
    for (const q of [
      `overview?project=${foreign.id}`,
      `sent?project=${foreign.id}`,
      `sequences?project=${foreign.id}`,
      `campaigns?project=${foreign.id}`,
    ]) {
      expect((await owner.client.get(path(q))).status).toBe(404);
    }
    expect((await owner.client.get(path('overview?project=not-a-uuid'))).status).toBe(400);
    await h.prisma.businessProfile.deleteMany({ where: { id: { in: [other.id, foreign.id] } } });
  });

  it('lists sent emails without bodies, filtered by project and campaign', async () => {
    const res = await owner.client.get(path(`sent?project=${ids.profile}`));
    const sent = res.body as { data: SentItem[]; nextCursor: string | null };
    expect(sent.data).toHaveLength(1);
    expect(sent.data[0]).toMatchObject({
      conversationId: ids.conversation,
      campaign: { id: ids.campaign, name: 'Dash Campaign' },
      stepOrder: 1,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/bodyText|Hello Ada/);
    expect(
      ((await owner.client.get(path(`sent?campaign=${ids.campaign}`))).body as { data: unknown[] })
        .data,
    ).toHaveLength(1);
  });

  it('returns each campaign sequence with step subjects only', async () => {
    const res = await owner.client.get(path(`sequences?project=${ids.profile}`));
    const seq = SequencesSchema.parse(res.body);
    expect(seq.data[0]!.campaign.id).toBe(ids.campaign);
    expect(seq.data[0]!.steps.map((s) => [s.stepOrder, s.intent, s.delayDays])).toEqual([
      [1, 'INTRO', 0],
      [2, 'FOLLOW_UP', 3],
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/bodyTemplate|aiInstructions/);
    expect(
      (
        (await owner.client.get(path(`campaigns?project=${ids.profile}`))).body as {
          data: unknown[];
        }
      ).data,
    ).toHaveLength(1);
  });
});

describe('records', () => {
  it('paginates leads with a signed cursor, filters by tier and searches', async () => {
    const first = await owner.client.get(path('leads?limit=2'));
    expect(first.status).toBe(200);
    const body = first.body as { data: { contact: { fullName: string } }[]; nextCursor: string };
    expect(body.data.map((l) => l.contact.fullName)).toEqual(['Grace Hopper', 'Alan Turing']);
    expect(body.nextCursor).toBeTruthy();
    const second = await owner.client.get(
      path(`leads?limit=2&cursor=${encodeURIComponent(body.nextCursor)}`),
    );
    expect((second.body as { data: unknown[]; nextCursor: null }).data).toHaveLength(1);
    expect((second.body as { nextCursor: null }).nextCursor).toBeNull();

    const tampered = await owner.client.get(
      path(`leads?cursor=${body.nextCursor.slice(0, -3)}abc`),
    );
    expect(tampered.status).toBe(400);
    expect(tampered.body).toMatchObject({ errors: [{ pointer: '/cursor' }] });
    expect(
      ((await owner.client.get(path('leads?tier=A'))).body as { data: unknown[] }).data,
    ).toHaveLength(1);
    expect(
      ((await owner.client.get(path('leads?q=turing'))).body as { data: unknown[] }).data,
    ).toHaveLength(1);
    expect((await owner.client.get(path('leads?limit=500'))).status).toBe(400);
  });

  it('returns company and contact detail with field provenance and score reasons', async () => {
    const company = CompanyDetailSchema.parse(
      (await owner.client.get(path(`companies/${ids.company}`))).body,
    );
    expect(company).toMatchObject({ name: 'Zeta Systems', contactsCount: 3 });
    expect(company.provenance[0]).toMatchObject({
      field: 'industry',
      provider: 'apollo',
      lawfulBasis: 'LEGITIMATE_INTEREST',
    });
    const contact = ContactDetailSchema.parse(
      (await owner.client.get(path(`contacts/${ids.contact}`))).body,
    );
    expect(contact.leads[0]).toMatchObject({ tier: 'A', reasons: ['Industry match'] });
    expect(contact.provenance[0]).toMatchObject({ field: 'email' });
    const catchAll = await owner.client.get(path('contacts?emailStatus=CATCH_ALL'));
    expect((catchAll.body as { data: { fullName: string }[] }).data.map((c) => c.fullName)).toEqual(
      ['Grace Hopper'],
    );
  });

  it('returns lead lists and ICPs with segments', async () => {
    const lists = (await owner.client.get(path('lead-lists'))).body as {
      data: { id: string; membersCount: number }[];
    };
    expect(lists.data[0]).toMatchObject({ id: ids.list, membersCount: 1 });
    expect(
      LeadListDetailSchema.parse((await owner.client.get(path(`lead-lists/${ids.list}`))).body)
        .leads,
    ).toHaveLength(1);
    const icps = IcpOverviewSchema.parse((await owner.client.get(path('icps'))).body);
    expect(icps.profiles[0]!.icps[0]).toMatchObject({
      name: 'Dash ICP',
      leadsCount: 3,
      painPoints: ['Slow replies'],
    });
    expect(icps.profiles[0]!.icps[0]!.segments[0]!.name).toBe('Support leads');
  });
});

describe('outreach', () => {
  it('returns campaigns with lifetime stats and per-step detail', async () => {
    const list = (await owner.client.get(path('campaigns'))).body as {
      data: { sent: number; replies: number; meetings: number; recipients: number }[];
    };
    // Lifetime totals: includes the send from 40 days ago (ranged numbers live in analytics).
    expect(list.data[0]).toMatchObject({ sent: 4, replies: 1, meetings: 1, recipients: 2 });
    const detail = CampaignDetailSchema.parse(
      (await owner.client.get(path(`campaigns/${ids.campaign}`))).body,
    );
    expect(detail.steps.map((s) => [s.stepOrder, s.sent, s.replies])).toEqual([
      [1, 3, 0],
      [2, 1, 1],
    ]);
    expect(detail.recipientStatus).toEqual({ REPLIED: 1, ACTIVE: 1 });
    expect(
      ((await owner.client.get(path('campaigns?status=DRAFT'))).body as { data: unknown[] }).data,
    ).toHaveLength(0);
  });

  it('returns inbox threads with filters and plain-text messages', async () => {
    const unread = (await owner.client.get(path('conversations?filter=unread'))).body as {
      data: { category: string }[];
    };
    expect(unread.data).toHaveLength(1);
    expect(unread.data[0]!.category).toBe('INTERESTED');
    expect(
      (
        (await owner.client.get(path('conversations?filter=interested'))).body as {
          data: unknown[];
        }
      ).data,
    ).toHaveLength(1);
    const thread = ConversationDetailSchema.parse(
      (await owner.client.get(path(`conversations/${ids.conversation}`))).body,
    );
    expect(thread.messages.map((m) => m.direction)).toEqual(['OUTBOUND', 'INBOUND']);
    expect(thread.messages[1]!.bodyText).toBe('Sounds <b>good</b>'); // raw text; the UI escapes it
    expect(thread.classification).toMatchObject({ category: 'INTERESTED', confidence: 0.9 });
  });

  it('splits meetings into upcoming and past', async () => {
    expect(
      ((await owner.client.get(path('meetings'))).body as { data: { id: string }[] }).data.map(
        (m) => m.id,
      ),
    ).toEqual([ids.meeting]);
    expect(
      ((await owner.client.get(path('meetings?when=past'))).body as { data: unknown[] }).data,
    ).toHaveLength(0);
  });
});

describe('account', () => {
  it('never exposes credentials in integrations', async () => {
    const res = await owner.client.get(path('integrations'));
    const body = IntegrationsSchema.parse(res.body);
    expect(body.providers[0]).toMatchObject({ provider: 'smtp', category: 'MAILBOX' });
    expect(body.domains[0]).toMatchObject({ spf: 'PASS', dmarc: 'FAIL' });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/credential|SECRET-CIPHERTEXT|keyVersion|syncCursor/i);
  });

  it('reports plan, seats, contacts and credits', async () => {
    const billing = BillingSchema.parse((await owner.client.get(path('billing'))).body);
    expect(billing.plan).toMatchObject({ key: 'trial', name: 'Trial', status: 'TRIALING' });
    expect(billing.usage.seats).toEqual({ used: 2, limit: 5 });
    expect(billing.usage.contacts.used).toBe(3);
    expect(billing.usage.credits.remaining).toBe(120);
    expect(billing.catalog.map((p) => p.key)).toEqual(['trial', 'starter', 'growth', 'agency']);
  });
});

const ENDPOINTS = [
  'overview',
  'analytics',
  'leads',
  'companies',
  'contacts',
  'lead-lists',
  'icps',
  'campaigns',
  'conversations',
  'meetings',
  'integrations',
  'billing',
  'projects',
  'sent',
  'sequences',
];
const DETAIL = () => [
  `companies/${ids.company}`,
  `contacts/${ids.contact}`,
  `lead-lists/${ids.list}`,
  `campaigns/${ids.campaign}`,
  `conversations/${ids.conversation}`,
];

describe('access control', () => {
  it.each(ENDPOINTS)('READ_ONLY members can read %s', async (endpoint) => {
    expect((await reader.client.get(path(endpoint))).status).toBe(200);
  });

  it.each(ENDPOINTS)('non-members get 404 for %s', async (endpoint) => {
    const res = await outsider.client.get(path(endpoint));
    expect(res.status).toBe(404);
    expect((await h.client().get(path(endpoint))).status).toBe(401);
  });

  it("returns 404 for another workspace's records, even through the caller's own workspace", async () => {
    for (const detail of DETAIL()) {
      expect((await outsider.client.get(path(detail))).status).toBe(404);
      expect((await outsider.client.get(`/workspaces/${outsiderWs}/${detail}`)).status).toBe(404);
    }
    expect((await owner.client.get(path('companies/not-a-uuid'))).status).toBe(404);
  });

  it("keeps the outsider's own lists free of this workspace's rows", async () => {
    for (const endpoint of [
      'leads',
      'companies',
      'contacts',
      'campaigns',
      'conversations',
      'meetings',
      'projects',
      'sent',
      'sequences',
    ]) {
      const res = await outsider.client.get(`/workspaces/${outsiderWs}/${endpoint}`);
      expect((res.body as { data: unknown[] }).data).toHaveLength(0);
    }
  });
});
