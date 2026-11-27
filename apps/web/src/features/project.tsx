'use client';

import { type SentItem, SentItemSchema, type Sequences } from '@lga/contracts';
import { Button } from '@lga/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@lga/ui/components/card';
import { cn } from '@lga/ui/lib/utils';
import {
  ArrowRight,
  ListOrdered,
  Mail,
  Pencil,
  Plus,
  SendHorizontal,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  type Column,
  DataTable,
  LoadMore,
  PageHeader,
  SearchInput,
  StatusBadge,
} from '@/components/data';
import { ComingSoon, EmptyState, ErrorPanel, TableSkeleton } from '@/components/states';
import { formatRelative, humanize } from '@/lib/format';
import { PHASE } from '@/lib/navigation';
import { useWorkspaceList } from '@/lib/use-list';
import { useWorkspace } from '@/lib/workspace-context';

type Initial<T> = { data: T[]; nextCursor: string | null };

function ProjectScopeNote() {
  const { project } = useWorkspace();
  if (!project) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      Project: <span className="font-medium text-foreground">{project.domain}</span>
    </span>
  );
}

// ------------------------------------------------------------------ sent

const sentColumns: Column<SentItem>[] = [
  {
    key: 'to',
    header: 'To',
    mobile: 'title',
    cell: (m) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium">
          {m.contact?.fullName ?? m.toEmails[0] ?? 'Unknown recipient'}
        </span>
        {m.contact?.fullName && (
          <span className="block truncate text-xs text-muted-foreground">{m.toEmails[0]}</span>
        )}
      </span>
    ),
  },
  {
    key: 'subject',
    header: 'Subject',
    mobile: 'subtitle',
    cell: (m) => <span className="line-clamp-1">{m.subject ?? '(no subject)'}</span>,
  },
  {
    key: 'campaign',
    header: 'Campaign',
    priority: 2,
    cell: (m) =>
      m.campaign ? (
        <span>
          {m.campaign.name}
          {m.stepOrder !== null && (
            <span className="text-muted-foreground"> · step {m.stepOrder}</span>
          )}
        </span>
      ) : (
        <span className="text-muted-foreground">Inbox reply</span>
      ),
  },
  {
    key: 'mailbox',
    header: 'From',
    priority: 3,
    cell: (m) => <span className="text-muted-foreground">{m.mailbox.emailAddress}</span>,
  },
  {
    key: 'sent',
    header: 'Sent',
    align: 'right',
    mobile: 'meta',
    cell: (m) => <time dateTime={m.sentAt}>{formatRelative(m.sentAt)}</time>,
  },
];

export function SentView({ initial }: { initial: Initial<SentItem> }) {
  const { href, project } = useWorkspace();
  const [q, setQ] = useState('');
  const query = useWorkspaceList(
    'sent',
    SentItemSchema,
    { project: project?.id, q: q || undefined },
    { ...initial, params: { project: project?.id, q: undefined } },
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sent"
        description="Every outreach email sent from your connected mailboxes. Open one to see the thread."
        actions={<ProjectScopeNote />}
      />
      <SearchInput value={q} onChange={setQ} placeholder="Search subject or recipient" />
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorPanel onRetry={() => void query.refetch()} />
      ) : query.rows.length === 0 ? (
        q ? (
          <EmptyState
            icon={SendHorizontal}
            title="No sent emails match your search"
            description="Try another name or subject."
          />
        ) : (
          <EmptyState
            icon={SendHorizontal}
            title="Nothing sent yet"
            description="Emails appear here as soon as a campaign starts sending from your mailbox."
            action={
              <Button asChild size="sm">
                <Link href={href('campaigns')}>Go to campaigns</Link>
              </Button>
            }
          />
        )
      ) : (
        <DataTable
          columns={sentColumns}
          rows={query.rows}
          caption="Sent emails"
          href={(m) => href(`inbox?c=${m.conversationId}`)}
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

// ------------------------------------------------------------------ sequences

function stepTiming(index: number, delayDays: number): string {
  if (index === 0) return 'Starts the sequence';
  if (delayDays === 0) return 'Same day';
  return `${delayDays} day${delayDays === 1 ? '' : 's'} later`;
}

export function SequencesView({ data }: { data: Sequences }) {
  const { href } = useWorkspace();
  const newSequence = (
    <ComingSoon
      phase={PHASE.campaigns}
      label="New sequence"
      icon={Plus}
      variant="default"
      reason="Sequence builder with AI-written steps."
    />
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Email sequences"
        description="The steps each campaign sends, in order. The agent writes every email from your project docs."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ProjectScopeNote />
            {newSequence}
          </div>
        }
      />
      {data.data.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="No sequences yet"
          description="A sequence is the set of emails a campaign sends, with the wait between them. It is created with the campaign."
          action={newSequence}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.data.map(({ campaign, steps }) => (
            <Card key={campaign.id} className="gap-4 rounded-xl">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <CardTitle className="truncate text-base">{campaign.name}</CardTitle>
                  <StatusBadge status={campaign.status} />
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={href(`campaigns/${campaign.id}`)}>
                    Campaign <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This campaign has no steps yet.</p>
                ) : (
                  <ol className="relative space-y-3">
                    {steps.map((step, index) => (
                      <li key={step.id} className="flex gap-3">
                        <span className="flex flex-col items-center">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold tabular">
                            {step.stepOrder}
                          </span>
                          {index < steps.length - 1 && (
                            <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0 flex-1 rounded-lg border bg-muted/30 p-3">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 font-medium text-foreground">
                              <Mail className="size-3.5" aria-hidden /> {humanize(step.type)}
                            </span>
                            <span aria-hidden>·</span>
                            <span>{stepTiming(index, step.delayDays)}</span>
                            <span aria-hidden>·</span>
                            <span>{humanize(step.intent)}</span>
                          </p>
                          <p
                            className={cn(
                              'mt-1.5 truncate text-sm',
                              !step.subject &&
                                'inline-flex items-center gap-1.5 text-muted-foreground',
                            )}
                          >
                            {step.subject ?? (
                              <>
                                <Sparkles className="size-3.5" aria-hidden /> Subject written by the
                                agent
                              </>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="mt-4 flex justify-end">
                  <ComingSoon phase={PHASE.campaigns} label="Edit steps" icon={Pencil} size="sm" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
