// Overview and analytics read models (PRD ANA-01/02/04, docs/architecture/11-analytics.md).
// Rates are computed for the whole range straight from message_events (distinct enrollments),
// never summed from daily values. All queries go through the tenant-scoped client.
import { Injectable } from '@nestjs/common';
import {
  type Analytics,
  computeMetrics,
  type EventCounts,
  type Kpi,
  METRIC_KEYS,
  METRICS,
  type Overview,
  RANGE_DAYS,
  type RangeKey,
  rate,
  relativeChange,
  type SeriesPoint,
} from '@lga/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { WorkspaceAccess } from '../../tenancy/workspace-access.service.js';

const DAY_MS = 86_400_000;

export interface RangeWindow {
  from: Date;
  to: Date;
  previousFrom: Date;
}

export function rangeWindow(range: RangeKey, now = new Date()): RangeWindow {
  const span = RANGE_DAYS[range] * DAY_MS;
  return {
    from: new Date(now.getTime() - span),
    to: now,
    previousFrom: new Date(now.getTime() - 2 * span),
  };
}

/** Calendar day in the workspace time zone (rollups use the workspace calendar, 11-analytics §4). */
function dayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function daysBetween(from: Date, to: Date, timezone: string): string[] {
  const days = new Set<string>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS)
    days.add(dayKey(new Date(t), timezone));
  days.add(dayKey(to, timezone));
  return [...days];
}

type EventWhere = Prisma.MessageEventWhereInput;

@Injectable()
export class InsightsQueries {
  constructor(private readonly prisma: PrismaService) {}

  private async workspaceTimezone(workspaceId: string): Promise<string> {
    const ws = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { defaultTimezone: true },
    });
    return ws.defaultTimezone;
  }

  /** Raw counts for one window. BOUNCED events are hard bounces (soft bounces are retried, not events). */
  async eventCounts(access: WorkspaceAccess, where: EventWhere): Promise<EventCounts> {
    const rows = await access.db.messageEvent.groupBy({
      by: ['type', 'recipientId'],
      where,
      _count: { _all: true },
    });
    const counts: EventCounts = {
      sent: 0,
      hardBounced: 0,
      unsubscribed: 0,
      meetingsBooked: 0,
      enrollmentsSent: 0,
      enrollmentsReplied: 0,
      enrollmentsPositive: 0,
    };
    const sent = new Set<string>();
    const replied = new Set<string>();
    const positive = new Set<string>();
    for (const row of rows) {
      const n = row._count._all;
      switch (row.type) {
        case 'SENT':
          counts.sent += n;
          if (row.recipientId) sent.add(row.recipientId);
          break;
        case 'BOUNCED':
          counts.hardBounced += n;
          break;
        case 'UNSUBSCRIBED':
          counts.unsubscribed += n;
          break;
        case 'MEETING_BOOKED':
          counts.meetingsBooked += n;
          break;
        case 'REPLIED':
          if (row.recipientId) replied.add(row.recipientId);
          break;
        case 'POSITIVE_REPLY':
          if (row.recipientId) positive.add(row.recipientId);
          break;
        default:
          break;
      }
    }
    counts.enrollmentsSent = sent.size;
    counts.enrollmentsReplied = replied.size;
    counts.enrollmentsPositive = positive.size;
    return counts;
  }

  private async newLeadsByTier(access: WorkspaceAccess, from: Date, to: Date) {
    const rows = await access.db.lead.groupBy({
      by: ['tier'],
      where: { createdAt: { gte: from, lt: to } },
      _count: { _all: true },
    });
    const byTier = { A: 0, B: 0, C: 0, D: 0 };
    let total = 0;
    for (const row of rows) {
      total += row._count._all;
      if (row.tier) byTier[row.tier] += row._count._all;
    }
    return { byTier, total };
  }

  private async kpis(access: WorkspaceAccess, w: RangeWindow) {
    const [current, previous, leadsNow, leadsBefore] = await Promise.all([
      this.eventCounts(access, { occurredAt: { gte: w.from, lt: w.to } }),
      this.eventCounts(access, { occurredAt: { gte: w.previousFrom, lt: w.from } }),
      this.newLeadsByTier(access, w.from, w.to),
      this.newLeadsByTier(access, w.previousFrom, w.from),
    ]);
    const now = computeMetrics(current, leadsNow.total);
    const before = computeMetrics(previous, leadsBefore.total);
    const kpis: Kpi[] = METRIC_KEYS.map((key) => ({
      key,
      ...METRICS[key],
      value: now[key],
      previous: before[key],
      change: relativeChange(now[key], before[key]),
    }));
    return { kpis, newLeadsByTier: leadsNow.byTier };
  }

  private async series(
    access: WorkspaceAccess,
    w: RangeWindow,
    timezone: string,
    where: EventWhere = {},
  ): Promise<SeriesPoint[]> {
    const events = await access.db.messageEvent.findMany({
      where: { ...where, occurredAt: { gte: w.from, lt: w.to }, type: { in: ['SENT', 'REPLIED'] } },
      select: { type: true, occurredAt: true },
    });
    const points = new Map(
      daysBetween(w.from, w.to, timezone).map((d) => [d, { date: d, sent: 0, replies: 0 }]),
    );
    for (const e of events) {
      const point = points.get(dayKey(e.occurredAt, timezone));
      if (!point) continue;
      if (e.type === 'SENT') point.sent += 1;
      else point.replies += 1;
    }
    return [...points.values()];
  }

  async overview(
    access: WorkspaceAccess,
    range: RangeKey,
    user: { emailVerified: boolean },
  ): Promise<Overview> {
    const w = rangeWindow(range);
    const timezone = await this.workspaceTimezone(access.workspaceId);
    const db = access.db;
    const [
      { kpis, newLeadsByTier },
      series,
      unreadReplies,
      draftsToReview,
      pendingApprovals,
      mailboxIssues,
      analyzedProfiles,
      activeIcps,
      leads,
      connectedMailboxes,
      verifiedDomains,
      launched,
    ] = await Promise.all([
      this.kpis(access, w),
      this.series(access, w, timezone),
      db.conversation.count({ where: { isUnread: true } }),
      db.messageDraft.count({ where: { status: 'NEEDS_REVIEW' } }),
      db.campaignApproval.count({ where: { status: 'PENDING' } }),
      db.inboxConnection.count({
        where: { deletedAt: null, status: { in: ['ERROR', 'DISCONNECTED', 'PAUSED'] } },
      }),
      db.businessProfile.count({ where: { deletedAt: null, lastAnalyzedAt: { not: null } } }),
      db.icp.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      db.lead.count(),
      db.inboxConnection.count({ where: { deletedAt: null, status: 'CONNECTED' } }),
      db.sendingDomain.count({
        where: { spfStatus: 'PASS', dkimStatus: 'PASS', dmarcStatus: 'PASS' },
      }),
      db.campaign.count({ where: { deletedAt: null, launchedAt: { not: null } } }),
    ]);
    return {
      range,
      from: w.from.toISOString(),
      to: w.to.toISOString(),
      timezone,
      kpis,
      newLeadsByTier,
      series,
      attention: { unreadReplies, draftsToReview, pendingApprovals, mailboxIssues },
      // WS-08 onboarding checklist, derived from real records.
      checklist: [
        {
          key: 'verify_email',
          label: 'Verify your email',
          done: user.emailVerified,
          href: 'settings',
        },
        {
          key: 'analyze_website',
          label: 'Analyze your website',
          done: analyzedProfiles > 0,
          href: 'icp',
        },
        { key: 'activate_icp', label: 'Activate an ICP', done: activeIcps > 0, href: 'icp' },
        { key: 'add_leads', label: 'Add leads', done: leads > 0, href: 'find-leads' },
        {
          key: 'connect_mailbox',
          label: 'Connect a mailbox',
          done: connectedMailboxes > 0,
          href: 'integrations',
        },
        {
          key: 'verify_domain',
          label: 'Verify domain records',
          done: verifiedDomains > 0,
          href: 'integrations',
        },
        {
          key: 'launch_campaign',
          label: 'Launch your first campaign',
          done: launched > 0,
          href: 'campaigns',
        },
      ],
    };
  }

  async analytics(access: WorkspaceAccess, range: RangeKey): Promise<Analytics> {
    const w = rangeWindow(range);
    const timezone = await this.workspaceTimezone(access.workspaceId);
    const inRange = { occurredAt: { gte: w.from, lt: w.to } };
    const [{ kpis }, series, campaigns, mailboxes, credits, grants] = await Promise.all([
      this.kpis(access, w),
      this.series(access, w, timezone),
      access.db.campaign.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      access.db.inboxConnection.findMany({
        where: { deletedAt: null },
        select: { id: true, emailAddress: true, status: true, dailyLimit: true },
        orderBy: { createdAt: 'asc' },
      }),
      access.db.usageLedger.groupBy({
        by: ['action'],
        where: { metric: 'CREDITS', status: 'SETTLED', createdAt: { gte: w.from, lt: w.to } },
        _sum: { quantity: true },
      }),
      access.db.creditGrant.aggregate({
        where: { expiresAt: { gt: new Date() } },
        _sum: { remainingMillicredits: true },
      }),
    ]);

    const campaignStats = await Promise.all(
      campaigns.map(async (c) => {
        const counts = await this.eventCounts(access, { ...inRange, campaignId: c.id });
        return {
          ...c,
          sent: counts.sent,
          replies: counts.enrollmentsReplied,
          positive: counts.enrollmentsPositive,
          meetings: counts.meetingsBooked,
          replyRate: rate(counts.enrollmentsReplied, counts.enrollmentsSent),
          positiveReplyRate: rate(counts.enrollmentsPositive, counts.enrollmentsSent),
          hardBounceRate: rate(counts.hardBounced, counts.sent),
        };
      }),
    );
    const mailboxStats = await Promise.all(
      mailboxes.map(async (m) => {
        const counts = await this.eventCounts(access, { ...inRange, inboxConnectionId: m.id });
        return {
          ...m,
          sent: counts.sent,
          hardBounced: counts.hardBounced,
          hardBounceRate: rate(counts.hardBounced, counts.sent),
        };
      }),
    );
    return {
      range,
      from: w.from.toISOString(),
      to: w.to.toISOString(),
      kpis,
      series,
      campaigns: campaignStats,
      mailboxes: mailboxStats,
      credits: {
        usedByAction: credits
          .filter((c) => c.action)
          .map((c) => ({ action: c.action!, credits: Number(c._sum.quantity ?? 0n) / 1000 })),
        remaining: Number(grants._sum.remainingMillicredits ?? 0n) / 1000,
      },
    };
  }
}
