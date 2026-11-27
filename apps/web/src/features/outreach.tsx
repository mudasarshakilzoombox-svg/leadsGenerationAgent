'use client';

import {
  type CampaignDetail,
  type CampaignItem,
  CampaignItemSchema,
  type ConversationDetail,
  ConversationDetailSchema,
  type ConversationItem,
  ConversationItemSchema,
  type MeetingItem,
  MeetingItemSchema,
} from '@lga/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@lga/ui/components/card';
import { Textarea } from '@lga/ui/components/input';
import { Tabs, TabsList, TabsTrigger } from '@lga/ui/components/misc';
import { cn } from '@lga/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, ExternalLink, Inbox, Plus, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import {
  type Column,
  DataTable,
  DetailList,
  FilterPills,
  LoadMore,
  PageHeader,
  SearchInput,
  StatusBadge,
} from '@/components/data';
import {
  CardSkeleton,
  ComingSoon,
  EmptyState,
  ErrorPanel,
  PhaseNote,
  TableSkeleton,
} from '@/components/states';
import { api } from '@/lib/api/client';
import {
  formatDate,
  formatDateTime,
  formatPercent,
  formatRelative,
  humanize,
  initials,
} from '@/lib/format';
import { PHASE } from '@/lib/navigation';
import { useWorkspaceList } from '@/lib/use-list';
import { useCan, useWorkspace } from '@/lib/workspace-context';

type Initial<T> = { data: T[]; nextCursor: string | null };

/** Launch vs submit-for-approval depends on the caller's permissions (01-frontend §6). */
function LaunchAction() {
  const canLaunch = useCan('campaigns.launch');
  const canSubmit = useCan('campaigns.submit_for_approval');
  if (!canLaunch && !canSubmit) return null;
  return (
    <ComingSoon
      phase={PHASE.campaigns}
      label={canLaunch ? 'Launch' : 'Submit for approval'}
      variant="default"
    />
  );
}

// ------------------------------------------------------------------ campaigns

const campaignColumns: Column<CampaignItem>[] = [
  { key: 'name', header: 'Campaign', mobile: 'title', cell: (c) => c.name },
  {
    key: 'status',
    header: 'Status',
    mobile: 'meta',
    cell: (c) => <StatusBadge status={c.status} />,
  },
  {
    key: 'icp',
    header: 'ICP',
    priority: 3,
    mobile: 'subtitle',
    cell: (c) => <span className="text-muted-foreground">{c.icpName}</span>,
  },
  {
    key: 'recipients',
    header: 'Recipients',
    priority: 2,
    align: 'right',
    cell: (c) => c.recipients,
  },
  { key: 'sent', header: 'Sent', align: 'right', mobile: 'meta', cell: (c) => `${c.sent} sent` },
  { key: 'replies', header: 'Replies', align: 'right', priority: 2, cell: (c) => c.replies },
  { key: 'meetings', header: 'Meetings', align: 'right', priority: 2, cell: (c) => c.meetings },
  {
    key: 'launched',
    header: 'Launched',
    align: 'right',
    priority: 3,
    cell: (c) => formatDate(c.launchedAt),
  },
];

type CampaignStatusFilter = '' | 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export function CampaignsView({ initial }: { initial: Initial<CampaignItem> }) {
  const { href, project } = useWorkspace();
  const [status, setStatus] = useState<CampaignStatusFilter>('');
  const [q, setQ] = useState('');
  // Campaigns are project-scoped (ADR-0036): the selected project from the sidebar.
  const query = useWorkspaceList(
    'campaigns',
    CampaignItemSchema,
    { project: project?.id, status: status || undefined, q: q || undefined },
    { ...initial, params: { project: project?.id, status: undefined, q: undefined } },
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description={
          project
            ? `Personalized email sequences for ${project.domain}, sent from your own mailboxes.`
            : 'Personalized email sequences sent from your own mailboxes.'
        }
        actions={
          <ComingSoon
            phase={PHASE.campaigns}
            label="New campaign"
            icon={Plus}
            variant="default"
            reason="Campaign wizard with AI drafts and launch checks."
          />
        }
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search campaigns" />
        <FilterPills
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'All' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'PENDING_APPROVAL', label: 'Pending approval' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'PAUSED', label: 'Paused' },
            { value: 'COMPLETED', label: 'Completed' },
          ]}
        />
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorPanel onRetry={() => void query.refetch()} />
      ) : query.rows.length === 0 ? (
        status || q ? (
          <EmptyState
            icon={Send}
            title="No campaigns match your filters"
            description="Try another status or search."
          />
        ) : (
          <EmptyState
            icon={Send}
            title="Your campaigns will appear here"
            description="Turn a lead list into a personalized sequence. Every email is reviewed before it sends."
            action={<ComingSoon phase={PHASE.campaigns} label="New campaign" variant="default" />}
          />
        )
      ) : (
        <DataTable
          columns={campaignColumns}
          rows={query.rows}
          caption="Campaigns"
          href={(c) => href(`campaigns/${c.id}`)}
          footer={
            <LoadMore
              hasMore={Boolean(query.hasNextPage)}
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            />
          }
        />
      )}
    </div>
  );
}

export function CampaignDetailView({ campaign }: { campaign: CampaignDetail }) {
  const { href } = useWorkspace();
  const replyRate = campaign.sent ? campaign.replies / Math.max(1, campaign.recipients) : null;
  const statusEntries = Object.entries(campaign.recipientStatus);
  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`${campaign.businessProfileName} · ${campaign.icpName}`}
        back={{ href: href('campaigns'), label: 'Campaigns' }}
        actions={
          <>
            <StatusBadge status={campaign.status} />
            <ComingSoon
              phase={PHASE.campaigns}
              label={campaign.status === 'ACTIVE' ? 'Pause' : 'Edit'}
            />
            {campaign.status === 'DRAFT' && <LaunchAction />}
          </>
        }
      />
      <section aria-label="Campaign totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Recipients', String(campaign.recipients)],
          ['Emails sent', String(campaign.sent)],
          [
            'Replies',
            `${campaign.replies}${replyRate !== null ? ` · ${formatPercent(replyRate)}` : ''}`,
          ],
          ['Meetings', String(campaign.meetings)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>
      <div className="grid-cols-1 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sequence</CardTitle>
            <CardDescription>{campaign.steps.length} steps</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {campaign.steps.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                    {s.stepOrder}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{humanize(s.intent)}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.stepOrder === 1 ? 'Sent first' : `After ${s.delayDays} days`} ·{' '}
                      {humanize(s.threadMode)}
                    </p>
                  </div>
                  <p className="tabular text-right text-sm">
                    {s.sent} sent
                    <span className="block text-xs text-muted-foreground">{s.replies} replies</span>
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recipients</CardTitle>
            </CardHeader>
            <CardContent>
              {statusEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one is enrolled yet.</p>
              ) : (
                <ul className="space-y-2">
                  {statusEntries.map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between text-sm">
                      <StatusBadge status={status} />
                      <span className="tabular">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Setup</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: 'Autonomy', value: campaign.autonomyLevel },
                  { label: 'Launched', value: formatDate(campaign.launchedAt) },
                  {
                    label: 'Approval',
                    value: campaign.approval ? (
                      <StatusBadge status={campaign.approval.status} />
                    ) : (
                      'Not requested'
                    ),
                  },
                  {
                    label: 'Mailboxes',
                    value: campaign.mailboxes.map((m) => m.emailAddress).join(', ') || null,
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ inbox

type InboxFilter = 'all' | 'unread' | 'interested';

function ThreadPane({ id, onBack }: { id: string; onBack: () => void }) {
  const { base, membership } = useWorkspace();
  const thread = useQuery({
    queryKey: ['ws', membership.workspace.id, 'conversation', id],
    queryFn: () => api(`${base}/conversations/${id}`, ConversationDetailSchema),
  });
  return (
    <section
      aria-label="Conversation"
      className="flex min-h-[60dvh] flex-col rounded-lg border bg-card"
    >
      <div className="flex items-center gap-2 border-b p-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex size-11 items-center justify-center rounded-md hover:bg-muted lg:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{thread.data?.subject ?? 'Conversation'}</p>
          {thread.data?.contact && (
            <p className="truncate text-xs text-muted-foreground">
              {thread.data.contact.fullName ?? thread.data.contact.email}
            </p>
          )}
        </div>
        {thread.data?.classification && (
          <StatusBadge status={thread.data.classification.category} />
        )}
      </div>
      {thread.isPending ? (
        <div className="p-4">
          <CardSkeleton />
        </div>
      ) : thread.isError ? (
        <div className="p-4">
          <ErrorPanel onRetry={() => void thread.refetch()} />
        </div>
      ) : (
        <Thread data={thread.data} />
      )}
    </section>
  );
}

function Thread({ data }: { data: ConversationDetail }) {
  return (
    <>
      {data.classification?.summary && (
        <p className="mx-4 mt-4 rounded-md bg-brand-soft px-3 py-2 text-sm">
          <Sparkles className="mr-1.5 inline size-3.5 text-brand" aria-hidden />
          {data.classification.summary}
          <span className="text-muted-foreground">
            {' '}
            · {Math.round(data.classification.confidence * 100)}% confidence
          </span>
        </p>
      )}
      <ol className="flex-1 space-y-4 overflow-y-auto p-4">
        {data.messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              'max-w-[85%] rounded-lg border p-3',
              m.direction === 'OUTBOUND' ? 'ml-auto bg-muted/50' : 'bg-background',
            )}
          >
            <p className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="break-all">{m.fromEmail}</span>
              <span>{formatDateTime(m.at)}</span>
            </p>
            {/* Plain text from an untrusted sender: rendered escaped, never as HTML. */}
            <p className="text-sm break-words whitespace-pre-wrap">
              {m.bodyText ?? '(no text content)'}
            </p>
          </li>
        ))}
      </ol>
      <div className="space-y-2 border-t p-3">
        <Textarea placeholder="Write a reply…" disabled aria-label="Reply" className="min-h-16" />
        <div className="flex flex-wrap justify-end gap-2">
          <ComingSoon phase={PHASE.inboxReply} label="Suggest reply" icon={Sparkles} size="sm" />
          <ComingSoon
            phase={PHASE.inboxReply}
            label="Send reply"
            icon={Send}
            size="sm"
            variant="default"
          />
        </div>
      </div>
    </>
  );
}

export function InboxView({ initial }: { initial: Initial<ConversationItem> }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const selected = search.get('c');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [q, setQ] = useState('');
  const query = useWorkspaceList(
    'conversations',
    ConversationItemSchema,
    { filter, q: q || undefined },
    { ...initial, params: { filter: 'all', q: undefined } },
  );
  // Shallow URL update (Next keeps useSearchParams in sync): no server re-render per click.
  const select = (id: string | null) =>
    window.history.replaceState(null, '', id ? `${pathname}?c=${id}` : pathname);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inbox"
        description="Replies from every connected mailbox, classified by intent."
      />
      <div className="grid-cols-1 grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className={cn('space-y-3', selected && 'hidden lg:block')}>
          <SearchInput value={q} onChange={setQ} placeholder="Search subject or contact" />
          <FilterPills<InboxFilter>
            label="Filter"
            value={filter}
            onChange={(v) => setFilter(v || 'all')}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
              { value: 'interested', label: 'Interested' },
            ]}
          />
          {query.isPending ? (
            <TableSkeleton rows={6} columns={1} />
          ) : query.isError ? (
            <ErrorPanel onRetry={() => void query.refetch()} />
          ) : query.rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={filter === 'all' && !q ? 'No replies yet' : 'Nothing matches'}
              description={
                filter === 'all' && !q
                  ? 'Replies appear here within 5 minutes.'
                  : 'Try another filter.'
              }
            />
          ) : (
            <ul className="divide-y overflow-hidden rounded-lg border bg-card">
              {query.rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => select(c.id)}
                    aria-current={selected === c.id ? 'true' : undefined}
                    className={cn(
                      'flex w-full gap-3 p-3 text-left hover:bg-muted/50',
                      selected === c.id && 'bg-muted',
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {initials(c.contact?.fullName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-sm',
                            c.isUnread ? 'font-semibold' : 'font-medium',
                          )}
                        >
                          {c.contact?.fullName ?? c.contact?.email ?? 'Unknown sender'}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelative(c.lastMessageAt)}
                        </span>
                      </span>
                      <span className="block truncate text-sm">{c.subject ?? '(no subject)'}</span>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          {c.snippet}
                        </span>
                        {c.category && <StatusBadge status={c.category} />}
                      </span>
                    </span>
                    {c.isUnread && (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-brand"
                        aria-label="Unread"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <LoadMore
            hasMore={Boolean(query.hasNextPage)}
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          />
        </div>
        <div className={cn(!selected && 'hidden lg:block')}>
          {selected ? (
            <ThreadPane key={selected} id={selected} onBack={() => select(null)} />
          ) : (
            <div className="flex min-h-[60dvh] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Select a conversation to read it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ meetings

export function MeetingsView({ upcoming }: { upcoming: MeetingItem[] }) {
  const { base, membership, href } = useWorkspace();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const past = useQuery({
    queryKey: ['ws', membership.workspace.id, 'meetings', 'past'],
    queryFn: () =>
      api(`${base}/meetings?when=past`, z.object({ data: z.array(MeetingItemSchema) })),
    enabled: when === 'past',
  });
  const rows = when === 'upcoming' ? upcoming : (past.data?.data ?? []);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings"
        description="Meetings booked from your campaigns and inbox."
        actions={
          <ComingSoon
            phase={PHASE.meetings}
            label="Connect calendar"
            icon={CalendarDays}
            reason="Google, Microsoft, Cal.com or Calendly."
          />
        }
      />
      <Tabs value={when} onValueChange={(v) => setWhen(v as 'upcoming' | 'past')}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
      </Tabs>
      {when === 'past' && past.isPending ? (
        <TableSkeleton rows={4} />
      ) : when === 'past' && past.isError ? (
        <ErrorPanel onRetry={() => void past.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={when === 'upcoming' ? 'No upcoming meetings' : 'No past meetings'}
          description="Meetings booked through your booking link or calendar invites appear here."
        />
      ) : (
        <ul className="grid-cols-1 grid gap-3 md:grid-cols-2">
          {rows.map((m) => (
            <li key={m.id} className="flex gap-4 rounded-lg border bg-card p-4">
              <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-md bg-brand-soft py-2 text-brand">
                <span className="text-xs font-medium uppercase">
                  {formatDate(m.startsAt, { month: 'short' })}
                </span>
                <span className="text-xl font-semibold">
                  {formatDate(m.startsAt, { day: 'numeric' })}
                </span>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{m.contact?.fullName ?? 'Meeting'}</p>
                  <StatusBadge status={m.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDate(m.startsAt, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}{' '}
                  · {humanize(m.provider)}
                </p>
                {m.campaign && (
                  <Link
                    href={href(`campaigns/${m.campaign.id}`)}
                    className="inline-flex min-h-11 max-w-full items-center truncate text-xs text-muted-foreground hover:underline sm:min-h-0"
                  >
                    From {m.campaign.name}
                  </Link>
                )}
                {m.meetingUrl && (
                  <a
                    href={m.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline sm:min-h-0"
                  >
                    Join meeting <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <PhaseNote phase={PHASE.meetings}>
        Calendar sync and automatic outcome tracking arrive with the meetings module.
      </PhaseNote>
    </div>
  );
}
