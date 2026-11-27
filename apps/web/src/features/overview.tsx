'use client';

import type { Overview, PerformanceMetric } from '@lga/contracts';
import { Button } from '@lga/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@lga/ui/components/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@lga/ui/components/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lga/ui/components/select';
import { cn } from '@lga/ui/lib/utils';
import { FileText, Inbox, Info, MailWarning, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KpiTile, MiniLineChart } from '@/components/charts/charts';
import { GetStarted } from '@/components/get-started';
import { formatCount } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace-context';

const RANGES = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
] as const;

const ALL = 'all';

/** Segmented 7d/30d/90d links (used by Analytics). */
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
          {r.label.replace('Last ', '')}
        </Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ next-step banner

const NEXT_STEP: Record<string, { text: string; action: string }> = {
  verify_email: {
    text: 'Confirm your email to unlock sending and invitations.',
    action: 'Open settings',
  },
  analyze_website: {
    text: 'Add your website so the agent learns what you sell.',
    action: 'Add website',
  },
  activate_icp: {
    text: 'Choose who you sell to so the agent finds the right leads.',
    action: 'Open project docs',
  },
  add_leads: { text: 'Find or import the companies and people to reach.', action: 'Find leads' },
  connect_mailbox: {
    text: 'Connect the mailbox your outreach is sent from.',
    action: 'Open channels',
  },
  verify_domain: {
    text: 'Add SPF, DKIM and DMARC so your emails land in the inbox.',
    action: 'Check DNS',
  },
  launch_campaign: {
    text: 'Everything is ready. Launch your first campaign.',
    action: 'Open campaigns',
  },
};

function NextStepBanner({ checklist }: { checklist: Overview['checklist'] }) {
  const { href, membership } = useWorkspace();
  const next = checklist.find((i) => !i.done);
  const storageKey = `lga.nextStep.skipped.${membership.workspace.id}`;
  const [skipped, setSkipped] = useState<string | null>(null);
  useEffect(() => {
    try {
      // Restore a per-viewer dismissal after mount (no storage during SSR).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSkipped(window.localStorage.getItem(storageKey));
    } catch {
      /* storage blocked */
    }
  }, [storageKey]);
  if (!next || skipped === next.key) return null;
  const copy = NEXT_STEP[next.key] ?? { text: next.label, action: 'Continue' };
  const skip = () => {
    setSkipped(next.key);
    try {
      window.localStorage.setItem(storageKey, next.key);
    } catch {
      /* ignore */
    }
  };
  return (
    <section
      aria-label="Next step"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-semibold">{next.label}</p>
          <p className="text-sm text-muted-foreground">{copy.text}</p>
        </div>
      </div>
      <div className="flex gap-2 sm:shrink-0">
        <Button variant="secondary" onClick={skip} className="flex-1 sm:flex-none">
          Skip
        </Button>
        <Button
          asChild
          className="flex-1 bg-emerald-700 text-white hover:bg-emerald-800 sm:flex-none dark:bg-brand dark:text-brand-foreground dark:hover:bg-brand/90"
        >
          <Link href={href(next.href)}>{copy.action}</Link>
        </Button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ filters

function PerformanceFilters({ data }: { data: Overview }) {
  const router = useRouter();
  const { href, project } = useWorkspace();
  const go = (range: string, campaign: string) => {
    const params = new URLSearchParams({ range });
    if (campaign !== ALL) params.set('campaign', campaign);
    router.push(`${href()}?${params.toString()}`, { scroll: false });
  };
  const campaign = data.campaignId ?? ALL;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex">
      <Select value={campaign} onValueChange={(v) => go(data.range, v)}>
        <SelectTrigger className="min-w-0 sm:w-60" aria-label="Campaign">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All campaigns</SelectItem>
          {(project?.campaigns ?? []).map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={data.range} onValueChange={(v) => go(v, campaign)}>
        <SelectTrigger className="w-20" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGES.map((r) => (
            <SelectItem key={r.key} value={r.key}>
              {r.key}
              <span className="sr-only"> ({r.label})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ------------------------------------------------------------------ performance cards

const CHART_COLOR: Record<PerformanceMetric['key'], string> = {
  sent: 'var(--chart-1)',
  delivered: 'var(--chart-1)',
  hotLeads: 'var(--chart-3)',
  creditsUsed: 'var(--chart-2)',
};

const HINT: Record<PerformanceMetric['key'], string> = {
  sent: 'Emails sent from your connected mailboxes.',
  delivered: 'Sent minus hard bounces.',
  hotLeads: 'People who replied with interest (positive replies).',
  creditsUsed: 'Credits spent on verification, AI drafts and research.',
};

function formatValue(metric: PerformanceMetric): string {
  if (metric.value === null) return '—';
  if (metric.format === 'credits') {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(metric.value);
  }
  return formatCount(metric.value);
}

export function PerformanceCard({ metric, range }: { metric: PerformanceMetric; range: string }) {
  const change = metric.change;
  // Spending is not good or bad by itself: credits change is shown neutrally.
  const tone =
    change === null || change === 0 || metric.key === 'creditsUsed'
      ? 'neutral'
      : change > 0 === metric.higherIsBetter
        ? 'good'
        : 'bad';
  return (
    <article
      className="flex flex-col gap-3 rounded-xl border bg-card p-5"
      aria-label={metric.label}
    >
      <header className="flex items-center gap-1.5">
        <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {metric.label}
        </h3>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              // 44 px touch target on phones, compact next to the label from `sm`.
              className="-m-3.5 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground sm:-m-2 sm:size-7"
              aria-label={`About ${metric.label}`}
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {HINT[metric.key]}
            {metric.scope === 'workspace'
              ? ' Workspace total: not split by project or campaign.'
              : ''}
          </TooltipContent>
        </Tooltip>
        {metric.scope === 'workspace' && (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            Workspace
          </span>
        )}
      </header>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <p className="tabular text-4xl font-semibold tracking-tight">
          {formatValue(metric)}
          {metric.format === 'credits' && metric.value !== null && (
            <span className="ml-1 text-base font-normal text-muted-foreground">credits</span>
          )}
        </p>
        {change !== null && (
          <p
            className={cn(
              'tabular text-sm',
              tone === 'good' && 'text-success',
              tone === 'bad' && 'text-destructive',
              tone === 'neutral' && 'text-muted-foreground',
            )}
          >
            <span aria-hidden>{change > 0 ? '▲' : change < 0 ? '▼' : '•'} </span>
            <span className="sr-only">
              {change > 0 ? 'Up' : change < 0 ? 'Down' : 'No change'}{' '}
            </span>
            {Math.abs(Math.round(change * 100))}%
            <span className="text-muted-foreground"> vs prev {range}</span>
          </p>
        )}
      </div>
      <MiniLineChart
        data={metric.series}
        name={metric.label}
        color={CHART_COLOR[metric.key]}
        className="h-36"
      />
    </article>
  );
}

// ------------------------------------------------------------------ attention

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
    <Card className="gap-4 rounded-xl">
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

// ------------------------------------------------------------------ page

export function OverviewView({ data }: { data: Overview }) {
  const { membership, project } = useWorkspace();
  const engagement = data.kpis.filter((k) => k.key !== 'emailsSent');
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight break-all sm:text-4xl">
          {project?.domain ?? membership.workspace.name}
        </h1>
        {project && project.name !== project.domain && (
          <p className="text-sm text-muted-foreground">{project.name}</p>
        )}
      </header>

      <NextStepBanner checklist={data.checklist} />

      <section aria-labelledby="performance-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="performance-title"
            className="text-sm font-medium tracking-wider text-muted-foreground uppercase"
          >
            Performance
          </h2>
          <PerformanceFilters data={data} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.performance.map((m) => (
            <PerformanceCard key={m.key} metric={m} range={data.range} />
          ))}
        </div>
      </section>

      <section aria-labelledby="engagement-title" className="space-y-4">
        <h2
          id="engagement-title"
          className="flex items-center gap-2 text-sm font-medium tracking-wider text-muted-foreground uppercase"
        >
          <Sparkles className="size-4" aria-hidden /> Engagement
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:col-span-2">
            {engagement.map((k) => (
              <KpiTile key={k.key} kpi={k} />
            ))}
          </div>
          <Attention data={data.attention} />
        </div>
      </section>

      <GetStarted items={data.checklist} />
    </div>
  );
}
