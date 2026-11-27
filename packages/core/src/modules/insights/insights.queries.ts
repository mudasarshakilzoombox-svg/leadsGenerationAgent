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
  type OverviewQuery,
  type PerformanceMetric,
  RANGE_DAYS,
  type RangeKey,
  rate,
  relativeChange,
  type SeriesPoint,
} from '@lga/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { resolveCampaignScope } from '../../platform/tenancy/campaign-scope.js';
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

  private async kpis(access: WorkspaceAccess, w: RangeWindow, scope: EventWhere = {}) {
    const [current, previous, leadsNow, leadsBefore] = await Promise.all([
      this.eventCounts(access, { ...scope, occurredAt: { gte: w.from, lt: w.to } }),
      this.eventCounts(access, { ...scope, occurredAt: { gte: w.previousFrom, lt: w.from } }),
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

  /**
   * Dashboard performance cards (ADR-0036): totals, previous period, change and a daily series.
   * Sent and Delivered count events; Hot leads counts distinct contacts with a positive reply;
   * Credits used sums settled ledger rows (workspace-wide: the ledger has no campaign link).
   */
  private async performance(
    access: WorkspaceAccess,
    w: RangeWindow,
    timezone: string,
    scope: EventWhere,
    filtered: boolean,
  ): Promise<PerformanceMetric[]> {
    const [events, ledger] = await Promise.all([
      access.db.messageEvent.findMany({
        where: {
          ...scope,
          occurredAt: { gte: w.previousFrom, lt: w.to },
          type: { in: ['SENT', 'BOUNCED', 'POSITIVE_REPLY'] },
        },
        select: { id: true, type: true, occurredAt: true, contactId: true, recipientId: true },
      }),
      access.db.usageLedger.findMany({
        where: {
          metric: 'CREDITS',
          status: 'SETTLED',
          createdAt: { gte: w.previousFrom, lt: w.to },
        },
        select: { quantity: true, createdAt: true },
      }),
    ]);

    const days = daysBetween(w.from, w.to, timezone);
    const zeroes = () => new Map(days.map((d) => [d, 0]));
    const bump = (map: Map<string, number>, day: string, by = 1) => {
      if (map.has(day)) map.set(day, (map.get(day) ?? 0) + by);
    };
    const period = () => ({ sent: 0, bounced: 0, credits: 0, hot: new Set<string>() });
    const now = period();
    const before = period();
    const daily = { sent: zeroes(), bounced: zeroes(), credits: zeroes() };
    const dailyHot = new Map(days.map((d) => [d, new Set<string>()]));

    for (const e of events) {
      const current = e.occurredAt >= w.from;
      const bucket = current ? now : before;
      const day = dayKey(e.occurredAt, timezone);
      if (e.type === 'SENT') {
        bucket.sent += 1;
        if (current) bump(daily.sent, day);
      } else if (e.type === 'BOUNCED') {
        bucket.bounced += 1;
        if (current) bump(daily.bounced, day);
      } else {
        const who = e.contactId ?? e.recipientId ?? e.id;
        bucket.hot.add(who);
        if (current) dailyHot.get(day)?.add(who);
      }
    }
    for (const row of ledger) {
      const credits = Number(row.quantity) / 1000;
      const current = row.createdAt >= w.from;
      (current ? now : before).credits += credits;
      if (current) bump(daily.credits, dayKey(row.createdAt, timezone), credits);
    }

    // No sends means nothing could be delivered: show "no data", not 0.
    const delivered = (p: ReturnType<typeof period>) => (p.sent > 0 ? p.sent - p.bounced : null);
    const round = (n: number) => Math.round(n * 1000) / 1000;
    const metric = (
      key: PerformanceMetric['key'],
      label: string,
      value: number | null,
      previous: number | null,
      series: Array<{ date: string; value: number }>,
      extra: Partial<PerformanceMetric> = {},
    ): PerformanceMetric => ({
      key,
      label,
      format: 'count',
      higherIsBetter: true,
      scope: 'filtered',
      value,
      previous,
      change: relativeChange(value, previous),
      series,
      ...extra,
    });
    return [
      metric(
        'sent',
        'Sent',
        now.sent,
        before.sent,
        days.map((d) => ({ date: d, value: daily.sent.get(d) ?? 0 })),
      ),
      metric(
        'delivered',
        'Delivered',
        delivered(now),
        delivered(before),
        days.map((d) => ({
          date: d,
          value: Math.max(0, (daily.sent.get(d) ?? 0) - (daily.bounced.get(d) ?? 0)),
        })),
      ),
      metric(
        'hotLeads',
        'Hot leads',
        now.hot.size,
        before.hot.size,
        days.map((d) => ({ date: d, value: dailyHot.get(d)?.size ?? 0 })),
      ),
      metric(
        'creditsUsed',
        'Credits used',
        round(now.credits),
        round(before.credits),
        days.map((d) => ({ date: d, value: round(daily.credits.get(d) ?? 0) })),
        // The ledger has no campaign link, so a filtered dashboard still shows workspace spend.
        { format: 'credits', higherIsBetter: false, scope: filtered ? 'workspace' : 'filtered' },
      ),
    ];
  }

  async overview(
    access: WorkspaceAccess,
    query: OverviewQuery,
    user: { emailVerified: boolean },
  ): Promise<Overview> {
    const { range } = query;
    const w = rangeWindow(range);
    const [timezone, campaignIds] = await Promise.all([
      this.workspaceTimezone(access.workspaceId),
      resolveCampaignScope(access, query),
    ]);
    const scope: EventWhere = campaignIds ? { campaignId: { in: campaignIds } } : {};
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
      this.kpis(access, w, scope),
      this.series(access, w, timezone, scope),
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
      projectId: query.project ?? null,
      campaignId: query.campaign ?? null,
      performance: await this.performance(access, w, timezone, scope, campaignIds !== null),
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
