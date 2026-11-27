// Read models for campaigns, inbox conversations and meetings (Phase 3-4 records, read-only).
import { Inject, Injectable } from '@nestjs/common';
import type {
  CampaignDetail,
  CampaignItem,
  ConversationDetail,
  ConversationItem,
  ListQuery,
  MeetingItem,
} from '@lga/contracts';
import { APP_CONFIG } from '../../config/config.module.js';
import type { ApiEnv } from '../../config/env.js';
import { DomainError } from '../../errors/domain-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { afterDesc, decodeCursor, pageOf } from '../../platform/pagination/cursor.js';
import type { WorkspaceAccess } from '../../tenancy/workspace-access.service.js';
import type { PageResult } from '../prospects/prospects.queries.js';

const campaignSelect = {
  id: true,
  name: true,
  status: true,
  autonomyLevel: true,
  launchedAt: true,
  createdAt: true,
  businessProfile: { select: { name: true } },
  icp: { select: { name: true } },
  _count: { select: { recipients: true } },
} satisfies Prisma.CampaignSelect;

type CampaignRow = Prisma.CampaignGetPayload<{ select: typeof campaignSelect }>;

const conversationSelect = {
  id: true,
  subject: true,
  status: true,
  isUnread: true,
  lastMessageAt: true,
  contact: { select: { id: true, fullName: true, email: true } },
  inboxConnection: { select: { id: true, emailAddress: true } },
  messages: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: {
      snippet: true,
      classification: { select: { category: true, overriddenCategory: true } },
    },
  },
} satisfies Prisma.ConversationSelect;

type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof conversationSelect }>;

function toConversation(c: ConversationRow): ConversationItem {
  const last = c.messages[0];
  return {
    id: c.id,
    subject: c.subject,
    status: c.status,
    isUnread: c.isUnread,
    lastMessageAt: c.lastMessageAt.toISOString(),
    snippet: last?.snippet ?? null,
    category: last?.classification
      ? (last.classification.overriddenCategory ?? last.classification.category)
      : null,
    contact: c.contact,
    mailbox: c.inboxConnection,
  };
}

const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} not found.`);

@Injectable()
export class OutreachQueries {
  constructor(@Inject(APP_CONFIG) private readonly env: ApiEnv) {}

  private async eventTotals(access: WorkspaceAccess, campaignIds: string[]) {
    if (campaignIds.length === 0)
      return new Map<string, { sent: number; replies: number; meetings: number }>();
    const rows = await access.db.messageEvent.groupBy({
      by: ['campaignId', 'type'],
      where: {
        campaignId: { in: campaignIds },
        type: { in: ['SENT', 'REPLIED', 'MEETING_BOOKED'] },
      },
      _count: { _all: true },
    });
    const totals = new Map<string, { sent: number; replies: number; meetings: number }>();
    for (const r of rows) {
      if (!r.campaignId) continue;
      const t = totals.get(r.campaignId) ?? { sent: 0, replies: 0, meetings: 0 };
      if (r.type === 'SENT') t.sent += r._count._all;
      if (r.type === 'REPLIED') t.replies += r._count._all;
      if (r.type === 'MEETING_BOOKED') t.meetings += r._count._all;
      totals.set(r.campaignId, t);
    }
    return totals;
  }

  private toCampaign(
    c: CampaignRow,
    t: { sent: number; replies: number; meetings: number } | undefined,
  ): CampaignItem {
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      autonomyLevel: c.autonomyLevel,
      businessProfileName: c.businessProfile.name,
      icpName: c.icp.name,
      recipients: c._count.recipients,
      sent: t?.sent ?? 0,
      replies: t?.replies ?? 0,
      meetings: t?.meetings ?? 0,
      launchedAt: c.launchedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async campaigns(
    access: WorkspaceAccess,
    query: ListQuery & { status?: string | undefined },
  ): Promise<PageResult<CampaignItem>> {
    const position = decodeCursor(query.cursor, this.env.SESSION_PEPPER);
    const rows = await access.db.campaign.findMany({
      where: {
        AND: [
          { deletedAt: null },
          afterDesc('createdAt', position),
          query.status ? { status: query.status as CampaignRow['status'] } : {},
          query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {},
        ],
      },
      select: campaignSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = pageOf(rows, query.limit, (r) => r.createdAt, this.env.SESSION_PEPPER);
    const totals = await this.eventTotals(
      access,
      page.rows.map((r) => r.id),
    );
    return {
      data: page.rows.map((r) => this.toCampaign(r, totals.get(r.id))),
      nextCursor: page.nextCursor,
    };
  }

  async campaign(access: WorkspaceAccess, campaignId: string): Promise<CampaignDetail> {
    const c = await access.db.campaign.findFirst({
      where: { id: campaignId, deletedAt: null },
      select: {
        ...campaignSelect,
        steps: {
          orderBy: { stepOrder: 'asc' },
          select: { id: true, stepOrder: true, intent: true, delayDays: true, threadMode: true },
        },
        approvals: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, decidedAt: true },
        },
        mailboxes: { select: { inboxConnection: { select: { id: true, emailAddress: true } } } },
      },
    });
    if (!c) throw notFound('Campaign');
    const [totals, recipientRows, stepRows] = await Promise.all([
      this.eventTotals(access, [c.id]),
      access.db.campaignRecipient.groupBy({
        by: ['status'],
        where: { campaignId: c.id },
        _count: { _all: true },
      }),
      access.db.messageEvent.groupBy({
        by: ['stepId', 'type'],
        where: { campaignId: c.id, type: { in: ['SENT', 'REPLIED'] } },
        _count: { _all: true },
      }),
    ]);
    const perStep = new Map<string, { sent: number; replies: number }>();
    for (const r of stepRows) {
      if (!r.stepId) continue;
      const s = perStep.get(r.stepId) ?? { sent: 0, replies: 0 };
      if (r.type === 'SENT') s.sent += r._count._all;
      else s.replies += r._count._all;
      perStep.set(r.stepId, s);
    }
    const approval = c.approvals[0];
    return {
      ...this.toCampaign(c, totals.get(c.id)),
      steps: c.steps.map((s) => ({
        ...s,
        sent: perStep.get(s.id)?.sent ?? 0,
        replies: perStep.get(s.id)?.replies ?? 0,
      })),
      recipientStatus: Object.fromEntries(recipientRows.map((r) => [r.status, r._count._all])),
      approval: approval
        ? { status: approval.status, decidedAt: approval.decidedAt?.toISOString() ?? null }
        : null,
      mailboxes: c.mailboxes.map((m) => m.inboxConnection),
    };
  }

  async conversations(
    access: WorkspaceAccess,
    query: ListQuery & { filter: 'all' | 'unread' | 'interested' },
  ): Promise<PageResult<ConversationItem>> {
    const position = decodeCursor(query.cursor, this.env.SESSION_PEPPER);
    const rows = await access.db.conversation.findMany({
      where: {
        AND: [
          afterDesc('lastMessageAt', position),
          query.filter === 'unread' ? { isUnread: true } : {},
          query.filter === 'interested'
            ? {
                messages: {
                  some: { classification: { category: { in: ['INTERESTED', 'MEETING_REQUEST'] } } },
                },
              }
            : {},
          query.q
            ? {
                OR: [
                  { subject: { contains: query.q, mode: 'insensitive' } },
                  { contact: { fullName: { contains: query.q, mode: 'insensitive' } } },
                ],
              }
            : {},
        ],
      },
      select: conversationSelect,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = pageOf(rows, query.limit, (r) => r.lastMessageAt, this.env.SESSION_PEPPER);
    return { data: page.rows.map(toConversation), nextCursor: page.nextCursor };
  }

  async conversation(access: WorkspaceAccess, conversationId: string): Promise<ConversationDetail> {
    const c = await access.db.conversation.findUnique({
      where: { id: conversationId },
      select: {
        ...conversationSelect,
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 200,
          select: {
            id: true,
            direction: true,
            fromEmail: true,
            toEmails: true,
            subject: true,
            snippet: true,
            bodyText: true,
            sentAt: true,
            receivedAt: true,
            createdAt: true,
            classification: {
              select: {
                category: true,
                overriddenCategory: true,
                confidence: true,
                sentiment: true,
                summary: true,
              },
            },
          },
        },
      },
    });
    if (!c) throw notFound('Conversation');
    const latestClassified = [...c.messages]
      .reverse()
      .find((m) => m.classification)?.classification;
    const lastMessage = c.messages.at(-1);
    return {
      ...toConversation({
        ...c,
        messages: lastMessage
          ? [{ snippet: lastMessage.snippet, classification: lastMessage.classification }]
          : [],
      }),
      messages: c.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        fromEmail: m.fromEmail,
        toEmails: m.toEmails,
        subject: m.subject,
        bodyText: m.bodyText,
        at: (m.sentAt ?? m.receivedAt ?? m.createdAt).toISOString(),
      })),
      classification: latestClassified
        ? {
            category: latestClassified.overriddenCategory ?? latestClassified.category,
            confidence: Number(latestClassified.confidence),
            sentiment: latestClassified.sentiment,
            summary: latestClassified.summary,
          }
        : null,
    };
  }

  async meetings(
    access: WorkspaceAccess,
    when: 'upcoming' | 'past',
  ): Promise<{ data: MeetingItem[]; nextCursor: null }> {
    const now = new Date();
    const rows = await access.db.meeting.findMany({
      where: when === 'upcoming' ? { endsAt: { gte: now } } : { endsAt: { lt: now } },
      orderBy: { startsAt: when === 'upcoming' ? 'asc' : 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        source: true,
        provider: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        meetingUrl: true,
        contact: { select: { id: true, fullName: true, email: true } },
        campaign: { select: { id: true, name: true } },
        host: { select: { name: true } },
      },
    });
    return {
      data: rows.map(({ host, ...m }) => ({
        ...m,
        startsAt: m.startsAt.toISOString(),
        endsAt: m.endsAt.toISOString(),
        hostName: host?.name ?? null,
      })),
      nextCursor: null,
    };
  }
}
