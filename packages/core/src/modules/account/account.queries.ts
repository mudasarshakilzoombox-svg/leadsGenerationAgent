// Integrations and billing read models. Credentials and secrets are never selected.
import { Injectable } from '@nestjs/common';
import type { Billing, Integrations } from '@lga/contracts';
import { PrismaService } from '../../database/prisma.service.js';
import { isPlanKey, PLAN_KEYS, PLANS } from '../../platform/billing/plans.js';
import type { WorkspaceAccess } from '../../tenancy/workspace-access.service.js';
import { SeatPolicy } from '../workspaces/index.js';

@Injectable()
export class AccountQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatPolicy,
  ) {}

  async integrations(access: WorkspaceAccess): Promise<Integrations> {
    const db = access.db;
    const [providers, mailboxes, calendars, domains] = await Promise.all([
      db.providerConnection.findMany({
        where: { revokedAt: null },
        select: {
          id: true,
          provider: true,
          category: true,
          status: true,
          lastUsedAt: true,
          lastErrorAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.inboxConnection.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          emailAddress: true,
          provider: true,
          status: true,
          statusReason: true,
          dailyLimit: true,
          lastSyncedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.calendarConnection.findMany({
        select: { id: true, provider: true, status: true, bookingUrl: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.sendingDomain.findMany({
        select: {
          id: true,
          domain: true,
          spfStatus: true,
          dkimStatus: true,
          dmarcStatus: true,
          mxStatus: true,
          lastCheckedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const iso = (d: Date | null) => d?.toISOString() ?? null;
    return {
      providers: providers.map((p) => ({
        ...p,
        lastUsedAt: iso(p.lastUsedAt),
        lastErrorAt: iso(p.lastErrorAt),
      })),
      mailboxes: mailboxes.map((m) => ({ ...m, lastSyncedAt: iso(m.lastSyncedAt) })),
      calendars,
      domains: domains.map((d) => ({
        id: d.id,
        domain: d.domain,
        spf: d.spfStatus,
        dkim: d.dkimStatus,
        dmarc: d.dmarcStatus,
        mx: d.mxStatus,
        lastCheckedAt: iso(d.lastCheckedAt),
      })),
    };
  }

  async billing(access: WorkspaceAccess): Promise<Billing> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: access.workspaceId },
      select: {
        planKey: true,
        status: true,
        trialEndsAt: true,
        subscription: { select: { status: true, billingInterval: true, currentPeriodEnd: true } },
      },
    });
    const plan = isPlanKey(workspace.planKey) ? PLANS[workspace.planKey] : PLANS.trial;
    const period = new Date().toISOString().slice(0, 7);
    const [seatLimit, members, pendingInvites, contacts, emails, credits] = await Promise.all([
      this.seats.limitFor(access.workspaceId),
      access.db.workspaceMember.count(),
      access.db.invitation.count({
        where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      access.db.contact.count({ where: { deletedAt: null } }),
      access.db.usageLedger.aggregate({
        where: { metric: 'EMAIL_SENT', status: 'SETTLED', period },
        _sum: { quantity: true },
      }),
      access.db.creditGrant.aggregate({
        where: { expiresAt: { gt: new Date() } },
        _sum: { remainingMillicredits: true },
      }),
    ]);
    return {
      plan: {
        key: workspace.planKey,
        name: plan.name,
        priceMonthlyCents: plan.prices?.monthly ?? null,
        status: workspace.status,
        trialEndsAt: workspace.trialEndsAt?.toISOString() ?? null,
      },
      subscription: workspace.subscription
        ? {
            status: workspace.subscription.status,
            billingInterval: workspace.subscription.billingInterval,
            currentPeriodEnd: workspace.subscription.currentPeriodEnd?.toISOString() ?? null,
          }
        : null,
      usage: {
        seats: { used: members + pendingInvites, limit: seatLimit },
        contacts: { used: contacts, limit: plan.limits.contactsStored },
        emails: {
          used: Number(emails._sum.quantity ?? 0n),
          limit: plan.limits.emailsPerMonth ?? plan.limits.emailsTotal,
          period,
        },
        credits: {
          remaining: Number(credits._sum.remainingMillicredits ?? 0n) / 1000,
          monthlyIncluded: plan.limits.monthlyCredits || plan.limits.trialCredits,
        },
      },
      catalog: PLAN_KEYS.map((key) => {
        const p = PLANS[key];
        return {
          key,
          name: p.name,
          priceMonthlyCents: p.prices?.monthly ?? null,
          priceAnnualPerMonthCents: p.prices?.annualPerMonth ?? null,
          seats: p.limits.seats,
          mailboxes: p.limits.mailboxes,
          emailsPerMonth: p.limits.emailsPerMonth,
          monthlyCredits: p.limits.monthlyCredits || p.limits.trialCredits,
          contactsStored: p.limits.contactsStored,
        };
      }),
    };
  }
}
