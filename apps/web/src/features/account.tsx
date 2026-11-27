'use client';

import type { Analytics, Billing, Integrations } from '@lga/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@lga/ui/components/card';
import { cn } from '@lga/ui/lib/utils';
import { BarChart3, CalendarDays, Check, Database, Globe, Mail, Plug } from 'lucide-react';
import { BarBreakdown, KpiTile, TrendChart } from '@/components/charts/charts';
import { DataTable, Meter, PageHeader, StatusBadge } from '@/components/data';
import { ComingSoon, EmptyState, PhaseNote } from '@/components/states';
import { formatDate, formatMoney, formatPercent, formatRelative, humanize } from '@/lib/format';
import { PHASE } from '@/lib/navigation';
import { useCan, useWorkspace } from '@/lib/workspace-context';
import { RangeSwitch } from './overview';

// ------------------------------------------------------------------ integrations

function Section({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: typeof Plug;
  title: string;
  description: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        <div className="hidden sm:block">{action}</div>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        <div className="sm:hidden">{action}</div>
      </CardContent>
    </Card>
  );
}

function Row({ title, subtitle, status }: { title: string; subtitle?: string; status: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <StatusBadge status={status} />
    </li>
  );
}

export function IntegrationsView({ data }: { data: Integrations }) {
  const canManage = useCan('integrations.manage');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Channels"
        description="Where outreach is sent from and what powers it: mailboxes, sending domains, data providers and calendars. Credentials are encrypted and never shown."
      />
      <div className="grid-cols-1 grid gap-6 lg:grid-cols-2">
        <Section
          icon={Mail}
          title="Mailboxes"
          description="Outreach is sent only from mailboxes you connect."
          action={<ComingSoon phase={PHASE.mailboxes} label="Connect mailbox" size="sm" />}
        >
          {data.mailboxes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mailbox connected yet.</p>
          ) : (
            <ul className="divide-y">
              {data.mailboxes.map((m) => (
                <Row
                  key={m.id}
                  title={m.emailAddress}
                  subtitle={`${humanize(m.provider)} · ${m.dailyLimit}/day · synced ${formatRelative(m.lastSyncedAt)}`}
                  status={m.status}
                />
              ))}
            </ul>
          )}
        </Section>
        <Section
          icon={Globe}
          title="Sending domains"
          description="SPF, DKIM and DMARC protect your deliverability."
          action={<ComingSoon phase={PHASE.mailboxes} label="Check DNS" size="sm" />}
        >
          {data.domains.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Domains appear when you connect a mailbox.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.domains.map((d) => (
                <li key={d.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{d.domain}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(['spf', 'dkim', 'dmarc', 'mx'] as const).map((k) => (
                      <StatusBadge
                        key={k}
                        status={d[k]}
                        label={`${k.toUpperCase()} ${humanize(d[k]).toLowerCase()}`}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Checked {formatRelative(d.lastCheckedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section
          icon={Database}
          title="Data providers"
          description="Bring your own keys for discovery and email verification."
          action={
            canManage ? (
              <ComingSoon phase={PHASE.integrations} label="Add provider" size="sm" />
            ) : null
          }
        >
          {data.providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No provider connected.</p>
          ) : (
            <ul className="divide-y">
              {data.providers.map((p) => (
                <Row
                  key={p.id}
                  title={humanize(p.provider)}
                  subtitle={`${humanize(p.category)} · last used ${formatRelative(p.lastUsedAt)}`}
                  status={p.status}
                />
              ))}
            </ul>
          )}
        </Section>
        <Section
          icon={CalendarDays}
          title="Calendars and booking"
          description="Detect booked meetings automatically."
          action={<ComingSoon phase={PHASE.meetings} label="Connect calendar" size="sm" />}
        >
          {data.calendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calendar connected.</p>
          ) : (
            <ul className="divide-y">
              {data.calendars.map((c) => (
                <Row
                  key={c.id}
                  title={humanize(c.provider)}
                  subtitle={c.bookingUrl ?? undefined}
                  status={c.status}
                />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ analytics

export function AnalyticsView({ data }: { data: Analytics }) {
  const { href } = useWorkspace();
  const hasActivity = data.series.some((p) => p.sent || p.replies);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`${formatDate(data.from)} – ${formatDate(data.to)}`}
        actions={
          <>
            <RangeSwitch value={data.range} basePath={href('analytics')} />
            <ComingSoon phase={PHASE.export} label="Export CSV" size="sm" />
          </>
        }
      />
      <section
        aria-label="Key metrics"
        className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7"
      >
        {data.kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} />
        ))}
      </section>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Sent vs replies</CardTitle>
        </CardHeader>
        <CardContent>
          {hasActivity ? (
            <TrendChart data={data.series} />
          ) : (
            <EmptyState
              icon={BarChart3}
              title="No activity in this range"
              description="Analytics appear after your first emails are sent."
            />
          )}
        </CardContent>
      </Card>
      <section className="space-y-3" aria-labelledby="campaign-report">
        <h2 id="campaign-report" className="text-base font-semibold">
          Campaigns
        </h2>
        {data.campaigns.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No campaigns yet"
            description="Per-campaign results appear once a campaign sends."
          />
        ) : (
          <DataTable
            caption="Campaign results"
            rows={data.campaigns}
            href={(c) => href(`campaigns/${c.id}`)}
            columns={[
              { key: 'name', header: 'Campaign', mobile: 'title', cell: (c) => c.name },
              {
                key: 'status',
                header: 'Status',
                mobile: 'meta',
                cell: (c) => <StatusBadge status={c.status} />,
              },
              { key: 'sent', header: 'Sent', align: 'right', mobile: 'meta', cell: (c) => c.sent },
              {
                key: 'reply',
                header: 'Reply rate',
                align: 'right',
                mobile: 'meta',
                cell: (c) => formatPercent(c.replyRate),
              },
              {
                key: 'positive',
                header: 'Positive',
                align: 'right',
                priority: 2,
                cell: (c) => formatPercent(c.positiveReplyRate),
              },
              {
                key: 'meetings',
                header: 'Meetings',
                align: 'right',
                priority: 2,
                cell: (c) => c.meetings,
              },
              {
                key: 'bounce',
                header: 'Bounce (hard)',
                align: 'right',
                priority: 3,
                cell: (c) => formatPercent(c.hardBounceRate),
              },
            ]}
          />
        )}
      </section>
      <div className="grid-cols-1 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mailbox health</CardTitle>
            <CardDescription>Hard bounces above 2% pause sending automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.mailboxes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No mailbox connected.</p>
            ) : (
              <ul className="divide-y">
                {data.mailboxes.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{m.emailAddress}</span>
                    <span className="tabular shrink-0 text-muted-foreground">
                      {m.sent} sent · {formatPercent(m.hardBounceRate)} bounce
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credits used</CardTitle>
            <CardDescription>
              {data.credits.remaining.toLocaleString('en-US')} credits remaining
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.credits.usedByAction.length === 0 ? (
              <p className="text-sm text-muted-foreground">No credits used in this range.</p>
            ) : (
              <BarBreakdown
                caption="Credits used by action"
                data={data.credits.usedByAction.map((c) => ({
                  label: humanize(c.action),
                  value: c.credits,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ billing

export function BillingView({ data }: { data: Billing }) {
  const isOwner = useCan('billing.manage');
  const { usage, plan } = data;
  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Your plan, usage this period and available plans." />
      <div className="grid-cols-1 grid gap-6 lg:grid-cols-3">
        <Card className="gap-4">
          <CardHeader>
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="text-2xl">{plan.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {plan.status === 'TRIALING' && plan.trialEndsAt
                ? `Trial ends ${formatDate(plan.trialEndsAt)}.`
                : data.subscription
                  ? `${humanize(data.subscription.billingInterval)} · renews ${formatDate(data.subscription.currentPeriodEnd)}`
                  : `${formatMoney(plan.priceMonthlyCents)} per month`}
            </p>
            <StatusBadge status={plan.status} />
            <div className="flex flex-wrap gap-2 pt-2">
              {isOwner ? (
                <>
                  <ComingSoon
                    phase={PHASE.billing}
                    label="Upgrade plan"
                    variant="default"
                    size="sm"
                  />
                  <ComingSoon phase={PHASE.billing} label="Buy credits" size="sm" />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only the workspace Owner can change the plan.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="gap-4 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Usage</CardTitle>
            <CardDescription>Period {usage.emails.period}</CardDescription>
          </CardHeader>
          <CardContent className="grid-cols-1 grid gap-5 sm:grid-cols-2">
            <Meter
              label="Seats (incl. pending invites)"
              used={usage.seats.used}
              limit={usage.seats.limit}
            />
            <Meter
              label="Contacts stored"
              used={usage.contacts.used}
              limit={usage.contacts.limit}
            />
            <Meter label="Emails sent" used={usage.emails.used} limit={usage.emails.limit} />
            <Meter
              label="Credits remaining"
              used={usage.credits.remaining}
              limit={usage.credits.monthlyIncluded || null}
            />
          </CardContent>
        </Card>
      </div>
      <section className="space-y-3" aria-labelledby="plans">
        <h2 id="plans" className="text-base font-semibold">
          Plans
        </h2>
        <div className="grid-cols-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.catalog.map((p) => {
            const current = p.key === plan.key;
            return (
              <div
                key={p.key}
                className={cn(
                  'flex flex-col gap-4 rounded-lg border bg-card p-5',
                  current && 'border-brand ring-1 ring-brand',
                )}
              >
                <div className="space-y-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-2xl font-semibold tracking-tight">
                    {formatMoney(p.priceMonthlyCents)}
                    {p.priceMonthlyCents !== null && (
                      <span className="text-sm font-normal text-muted-foreground"> / month</span>
                    )}
                  </p>
                </div>
                <ul className="flex-1 space-y-1.5 text-sm text-muted-foreground">
                  {[
                    `${p.seats} seats`,
                    `${p.mailboxes} mailboxes`,
                    p.emailsPerMonth
                      ? `${p.emailsPerMonth.toLocaleString('en-US')} emails / month`
                      : '100 emails total',
                    `${p.monthlyCredits.toLocaleString('en-US')} credits${p.priceMonthlyCents === null ? '' : ' / month'}`,
                    `${p.contactsStored.toLocaleString('en-US')} contacts`,
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="size-3.5 text-success" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                {current ? (
                  <p className="text-sm font-medium text-brand">Current plan</p>
                ) : (
                  <ComingSoon
                    phase={PHASE.billing}
                    label={`Choose ${p.name}`}
                    size="sm"
                    className="w-full"
                    reason={isOwner ? undefined : 'Only the Owner can change plans.'}
                  />
                )}
              </div>
            );
          })}
        </div>
        <PhaseNote phase={PHASE.billing}>
          Checkout, invoices and credit packs arrive with the billing module.
        </PhaseNote>
      </section>
    </div>
  );
}
