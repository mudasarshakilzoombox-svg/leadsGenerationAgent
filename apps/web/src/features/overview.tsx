'use client';

import type { Overview } from '@lga/contracts';
import { Button } from '@lga/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@lga/ui/components/card';
import { Progress } from '@lga/ui/components/misc';
import { cn } from '@lga/ui/lib/utils';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Circle,
  FileText,
  Inbox,
  MailWarning,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { BarBreakdown, KpiTile, TrendChart } from '@/components/charts/charts';
import { PageHeader } from '@/components/data';
import { EmptyState } from '@/components/states';
import { formatDate } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace-context';

const RANGES = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
] as const;

export function RangeSwitch({ value, basePath }: { value: string; basePath: string }) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex rounded-lg border bg-background p-0.5"
    >
      {RANGES.map((r) => (
        <Link
          key={r.key}
          href={`${basePath}?range=${r.key}`}
          scroll={false}
          aria-current={value === r.key ? 'true' : undefined}
          className={cn(
            'inline-flex min-h-9 items-center rounded-md px-3 text-sm transition-colors',
            value === r.key
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}

function Attention({ data }: { data: Overview['attention'] }) {
  const { href } = useWorkspace();
  const items = [
    { label: 'Replies waiting for you', count: data.unreadReplies, icon: Inbox, to: href('inbox') },
    {
      label: 'Drafts to review',
      count: data.draftsToReview,
      icon: FileText,
      to: href('campaigns'),
    },
    {
      label: 'Launch requests',
      count: data.pendingApprovals,
      icon: ShieldCheck,
      to: href('campaigns'),
    },
    {
      label: 'Mailbox issues',
      count: data.mailboxIssues,
      icon: MailWarning,
      to: href('integrations'),
    },
  ];
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Needs attention</CardTitle>
        <CardDescription>
          {total === 0
            ? 'You are all caught up.'
            : `${total} item${total === 1 ? '' : 's'} waiting`}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3">
        <ul>
          {items.map((i) => (
            <li key={i.label}>
              <Link
                href={i.to}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
              >
                <i.icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1">{i.label}</span>
                <span
                  className={cn(
                    'tabular min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-medium',
                    i.count > 0 ? 'bg-brand-soft text-brand' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Checklist({ items }: { items: Overview['checklist'] }) {
  const { href } = useWorkspace();
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  const next = items.find((i) => !i.done)!;
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Get set up</CardTitle>
        <CardDescription>
          {done} of {items.length} steps done. Next: {next.label.toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={(done / items.length) * 100} aria-label="Setup progress" />
        <ol className="grid-cols-1 grid gap-1 sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.key}>
              <Link
                href={href(i.href)}
                className="flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                {i.done ? (
                  <CheckCircle2 className="size-4 text-success" aria-label="Done" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-label="To do" />
                )}
                <span className={cn(i.done && 'text-muted-foreground line-through')}>
                  {i.label}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function OverviewView({ data }: { data: Overview }) {
  const { membership, href } = useWorkspace();
  const hasActivity = data.series.some((p) => p.sent > 0 || p.replies > 0);
  const primary = data.kpis.filter((k) =>
    ['emailsSent', 'replyRate', 'positiveReplyRate', 'meetingsBooked'].includes(k.key),
  );
  const secondary = data.kpis.filter((k) => !primary.includes(k));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`${membership.workspace.name} · ${formatDate(data.from)} – ${formatDate(data.to)}`}
        actions={<RangeSwitch value={data.range} basePath={href()} />}
      />
      <Checklist items={data.checklist} />
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {primary.map((k) => (
          <KpiTile key={k.key} kpi={k} />
        ))}
      </section>
      <div className="grid-cols-1 grid gap-6 lg:grid-cols-3">
        <Card className="gap-4 lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Sent vs replies</CardTitle>
              <CardDescription>Daily, in {data.timezone}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={href('analytics')}>
                Analytics <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {hasActivity ? (
              <TrendChart data={data.series} />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No sending activity in this range"
                description="Analytics appear after your first emails are sent."
                action={
                  <Button asChild size="sm">
                    <Link href={href('campaigns')}>Go to campaigns</Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
        <Attention data={data.attention} />
      </div>
      <div className="grid-cols-1 grid gap-6 lg:grid-cols-3">
        <section
          aria-label="Quality metrics"
          className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:col-span-2"
        >
          {secondary.map((k) => (
            <KpiTile key={k.key} kpi={k} />
          ))}
        </section>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-base">New leads by tier</CardTitle>
            <CardDescription>Created in this range</CardDescription>
          </CardHeader>
          <CardContent>
            <BarBreakdown
              caption="New leads by tier"
              data={(['A', 'B', 'C', 'D'] as const).map((t) => ({
                label: `Tier ${t}`,
                value: data.newLeadsByTier[t],
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
